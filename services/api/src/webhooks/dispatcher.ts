import { changed, Db, dialectOf, retryOnDeadlock } from '../db/db';
import { AppContext } from '../http/context';
import { signWebhook } from './outbox';

const MAX_ATTEMPTS = 10;
const BATCH = 20;
const TIMEOUT_MS = 10_000;
/** A claimed delivery is retried after this if the worker dies mid-send. */
const CLAIM_LEASE_MS = 5 * 60_000;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

interface Claimed {
  id: number;
  event_type: string;
  payload: unknown;
  attempts: number;
  created_at: Date;
  tenant_id: string;
  webhook_url: string | null;
  webhook_secret: string | null;
}

/** Retry delay after `attempts` failures: 30s, 1m, 2m … capped at 6h. */
export const retryDelayMs = (attempts: number) => Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 6 * 3600_000);

/**
 * Claim up to a batch of due deliveries by pushing their next_attempt_at forward (a lease), so a
 * crash mid-send just retries later and two workers never send the same delivery.
 * Postgres and MySQL 8: FOR UPDATE SKIP LOCKED. SQLite (single writer): a guarded UPDATE per row.
 */
export async function claimDue(ctx: AppContext, now: Date): Promise<Claimed[]> {
  const db = ctx.db;
  const lease = new Date(now.getTime() + CLAIM_LEASE_MS);
  const due = (q: Db) =>
    q
      .selectFrom('sagegames_webhook_deliveries')
      .select('id')
      .where('status', '=', 'pending')
      .where('next_attempt_at', '<=', now)
      .orderBy('next_attempt_at')
      .orderBy('id')
      .limit(BATCH);

  let ids: number[];
  if (dialectOf(db) === 'sqlite') {
    ids = [];
    for (const { id } of await due(db).execute()) {
      const claimed = await db
        .updateTable('sagegames_webhook_deliveries')
        .set({ next_attempt_at: lease })
        .where('id', '=', id)
        .where('status', '=', 'pending')
        .where('next_attempt_at', '<=', now)
        .executeTakeFirst();
      if (changed(claimed) === 1) ids.push(id);
    }
  } else {
    // READ COMMITTED: no gap locks, so concurrent claims and status updates don't deadlock on MySQL.
    ids = await retryOnDeadlock(() =>
      db
        .transaction()
        .setIsolationLevel('read committed')
        .execute(async (q) => {
          const rows = await due(q).forUpdate().skipLocked().execute();
          const picked = rows.map((r) => r.id);
          if (picked.length) await q.updateTable('sagegames_webhook_deliveries').set({ next_attempt_at: lease }).where('id', 'in', picked).execute();
          return picked;
        })
    );
  }
  if (ids.length === 0) return [];

  return db
    .selectFrom('sagegames_webhook_deliveries as d')
    .innerJoin('sagegames_tenants as t', 't.id', 'd.tenant_id')
    .select(['d.id', 'd.event_type', 'd.payload', 'd.attempts', 'd.created_at', 'd.tenant_id', 't.webhook_url', 't.webhook_secret'])
    .where('d.id', 'in', ids)
    .orderBy('d.id')
    .execute();
}

/** Deliver due webhooks once. Returns how many were attempted. */
export async function dispatchDue(ctx: AppContext, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<number> {
  const claimed = await claimDue(ctx, ctx.now());

  for (const d of claimed) {
    const attempts = d.attempts + 1;
    let error: string | null = null;

    if (!d.webhook_url || !d.webhook_secret) {
      error = 'webhook no longer configured';
    } else {
      const body = JSON.stringify({
        id: `evt_${d.id}`,
        type: d.event_type,
        tenantId: d.tenant_id,
        createdAt: d.created_at.toISOString(),
        data: d.payload,
      });
      try {
        const res = await fetchImpl(d.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SageGames-Webhooks/1',
            'Sage-Event': d.event_type,
            'Sage-Delivery': String(d.id),
            'Sage-Signature': signWebhook(d.webhook_secret, body, Math.floor(ctx.now().getTime() / 1000)),
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) error = `HTTP ${res.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }

    if (error === null) {
      await retryOnDeadlock(() =>
        ctx.db
          .updateTable('sagegames_webhook_deliveries')
          .set({ status: 'delivered', attempts, delivered_at: ctx.now(), last_error: null })
          .where('id', '=', d.id)
          .execute()
      );
    } else {
      const failed = attempts >= MAX_ATTEMPTS || !d.webhook_url;
      await retryOnDeadlock(() =>
        ctx.db
          .updateTable('sagegames_webhook_deliveries')
          .set({
            status: failed ? 'failed' : 'pending',
            attempts,
            last_error: error!.slice(0, 500),
            next_attempt_at: new Date(ctx.now().getTime() + retryDelayMs(attempts)),
          })
          .where('id', '=', d.id)
          .execute()
      );
    }
  }
  return claimed.length;
}

/** Poll for due webhooks every few seconds. Returns a stop function. */
export function startWebhookWorker(ctx: AppContext, intervalMs = 5000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    dispatchDue(ctx)
      .catch((err) => ctx.logger.error('webhook dispatch failed', { component: 'webhooks', err }))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
