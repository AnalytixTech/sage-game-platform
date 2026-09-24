import { AppContext } from '../http/context';
import { signWebhook } from './outbox';

const MAX_ATTEMPTS = 10;
const BATCH = 20;
const TIMEOUT_MS = 10_000;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

interface Claimed {
  id: number | string;
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

/** Deliver due webhooks once. Returns how many were attempted. */
export async function dispatchDue(ctx: AppContext, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<number> {
  // Claim a batch by pushing next_attempt_at forward, so a crash mid-send just retries later.
  const claimed = await ctx.db.query<Claimed>(
    `WITH due AS (
       SELECT id FROM webhook_deliveries
        WHERE status = 'pending' AND next_attempt_at <= $1
        ORDER BY next_attempt_at LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
     )
     UPDATE webhook_deliveries d SET next_attempt_at = $1::timestamptz + interval '5 minutes'
       FROM due, tenants t
      WHERE d.id = due.id AND t.id = d.tenant_id
     RETURNING d.id, d.event_type, d.payload, d.attempts, d.created_at, d.tenant_id, t.webhook_url, t.webhook_secret`,
    [ctx.now()]
  );

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
        createdAt: new Date(d.created_at).toISOString(),
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
      await ctx.db.query(
        `UPDATE webhook_deliveries SET status = 'delivered', attempts = $2, delivered_at = $3, last_error = NULL WHERE id = $1`,
        [d.id, attempts, ctx.now()]
      );
    } else {
      const failed = attempts >= MAX_ATTEMPTS || !d.webhook_url;
      await ctx.db.query(
        `UPDATE webhook_deliveries SET status = $2, attempts = $3, last_error = $4, next_attempt_at = $5 WHERE id = $1`,
        [d.id, failed ? 'failed' : 'pending', attempts, error.slice(0, 500), new Date(ctx.now().getTime() + retryDelayMs(attempts))]
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
      .catch((err) => ctx.log('webhook dispatch failed', err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
