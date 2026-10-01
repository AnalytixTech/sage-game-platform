import crypto from 'crypto';
import { sql } from 'kysely';
import { generateApiKey, hashKeySecret, KeyMode, keyPreview, randomId } from '../auth/keys';
import { ALL_GAME_IDS } from '../catalog';
import { changed, Db, json, onConflictUpdate, utcDay } from '../db/db';
import { HttpError } from '../http/errors';

export interface TenantSummary {
  id: string;
  name: string;
  status: string;
  role: 'owner' | 'admin';
  gameIds: string[];
  webhookUrl: string | null;
  createdAt: string;
}

export async function createTenant(
  q: Db,
  input: { name: string; ownerUserId?: string; gameIds: string[]; id?: string },
  now: Date
): Promise<string> {
  const id = input.id ?? randomId('app', 8);
  await q.insertInto('sagegames_tenants').values({ id, name: input.name, created_at: now, updated_at: now }).execute();
  if (input.ownerUserId) {
    await q.insertInto('sagegames_tenant_members').values({ tenant_id: id, user_id: input.ownerUserId, role: 'owner', created_at: now }).execute();
  }
  await setGameAccess(q, id, input.gameIds);
  return id;
}

/** Enable exactly `gameIds` for the tenant, keeping per-game default configs. */
export async function setGameAccess(q: Db, tenantId: string, gameIds: string[]): Promise<void> {
  const known = gameIds.filter((g) => ALL_GAME_IDS.includes(g));
  await q.updateTable('sagegames_tenant_game_access').set({ is_enabled: false }).where('tenant_id', '=', tenantId).execute();
  for (const gameId of known) {
    await onConflictUpdate(
      q,
      q.insertInto('sagegames_tenant_game_access').values({ tenant_id: tenantId, game_id: gameId, is_enabled: true, allowed_configurations: json({}) }),
      ['tenant_id', 'game_id'],
      { is_enabled: true }
    ).execute();
  }
}

/** Tenants named in SAGE_TENANT_KEYS must exist so their bootstrap keys can create sessions. */
export async function ensureBootstrapTenants(db: Db, tenantIds: string[], now: Date): Promise<void> {
  for (const id of tenantIds) {
    const exists = await db.selectFrom('sagegames_tenants').select('id').where('id', '=', id).executeTakeFirst();
    if (!exists) {
      await db.transaction().execute((q) => createTenant(q, { id, name: id, gameIds: ALL_GAME_IDS }, now));
    }
  }
}

export async function requireMembership(q: Db, tenantId: string, userId: string): Promise<'owner' | 'admin'> {
  const row = await q
    .selectFrom('sagegames_tenant_members')
    .select('role')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row) throw new HttpError(404, 'App not found', 'app_not_found');
  return row.role;
}

export async function listTenantsForUser(q: Db, userId: string): Promise<TenantSummary[]> {
  const rows = await q
    .selectFrom('sagegames_tenants as t')
    .innerJoin('sagegames_tenant_members as m', 'm.tenant_id', 't.id')
    .select(['t.id', 't.name', 't.status', 'm.role', 't.webhook_url', 't.created_at'])
    .where('m.user_id', '=', userId)
    .orderBy('t.created_at')
    .orderBy('t.id')
    .execute();
  if (rows.length === 0) return [];
  const access = await q
    .selectFrom('sagegames_tenant_game_access')
    .select(['tenant_id', 'game_id'])
    .where(
      'tenant_id',
      'in',
      rows.map((r) => r.id)
    )
    .where('is_enabled', '=', true)
    .orderBy('game_id')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    role: r.role,
    gameIds: access.filter((a) => a.tenant_id === r.id).map((a) => a.game_id),
    webhookUrl: r.webhook_url,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface ApiKeySummary {
  id: string;
  mode: KeyMode;
  label: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const MAX_ACTIVE_KEYS = 10;

export async function createApiKey(
  db: Db,
  input: { tenantId: string; mode: KeyMode; label: string; userId: string | null; pepper: string },
  now: Date
): Promise<ApiKeySummary & { key: string }> {
  const active = await db
    .selectFrom('sagegames_api_keys')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('tenant_id', '=', input.tenantId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (Number(active?.n ?? 0) >= MAX_ACTIVE_KEYS) {
    throw new HttpError(409, `An app can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`, 'too_many_keys');
  }

  const generated = generateApiKey(input.mode);
  await db
    .insertInto('sagegames_api_keys')
    .values({
      id: generated.id,
      tenant_id: input.tenantId,
      mode: input.mode,
      key_hash: hashKeySecret(generated.secret, input.pepper),
      label: input.label,
      created_by: input.userId,
      created_at: now,
    })
    .execute();
  return {
    id: generated.id,
    mode: input.mode,
    label: input.label,
    preview: keyPreview(input.mode, generated.id),
    createdAt: now.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
    key: generated.key,
  };
}

export async function listApiKeys(q: Db, tenantId: string): Promise<ApiKeySummary[]> {
  const rows = await q
    .selectFrom('sagegames_api_keys')
    .select(['id', 'mode', 'label', 'created_at', 'last_used_at', 'revoked_at'])
    .where('tenant_id', '=', tenantId)
    .orderBy('created_at', 'desc')
    .orderBy('id')
    .execute();
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    label: r.label,
    preview: keyPreview(r.mode, r.id),
    createdAt: r.created_at.toISOString(),
    lastUsedAt: iso(r.last_used_at),
    revokedAt: iso(r.revoked_at),
  }));
}

export async function revokeApiKey(q: Db, tenantId: string, keyId: string, now: Date): Promise<void> {
  const result = await q
    .updateTable('sagegames_api_keys')
    .set({ revoked_at: now })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', keyId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (changed(result) === 0) throw new HttpError(404, 'Key not found or already revoked', 'key_not_found');
}

/**
 * Webhook URLs must be public https endpoints (http allowed outside production), so the platform
 * cannot be used to probe internal addresses.
 */
export function validateWebhookUrl(raw: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'Webhook URL is not a valid URL', 'invalid_webhook_url');
  }
  if (url.protocol !== 'https:' && (production || url.protocol !== 'http:')) {
    throw new HttpError(400, 'Webhook URL must use https', 'invalid_webhook_url');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host) ||
    host === '::1' ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host);
  if (production && privateHost) {
    throw new HttpError(400, 'Webhook URL must point to a public host', 'invalid_webhook_url');
  }
  return url.toString();
}

export async function setWebhook(
  db: Db,
  tenantId: string,
  url: string | null,
  now: Date
): Promise<{ webhookUrl: string | null; webhookSecret: string | null }> {
  return db.transaction().execute(async (q) => {
    await q
      .updateTable('sagegames_tenants')
      .set(
        url === null
          ? { webhook_url: null, webhook_secret: null, updated_at: now }
          : { webhook_url: url, webhook_secret: sql<string>`coalesce(${sql.ref('webhook_secret')}, ${newWebhookSecret()})`, updated_at: now }
      )
      .where('id', '=', tenantId)
      .execute();
    const row = await q.selectFrom('sagegames_tenants').select(['webhook_url', 'webhook_secret']).where('id', '=', tenantId).executeTakeFirstOrThrow();
    return { webhookUrl: row.webhook_url, webhookSecret: row.webhook_secret };
  });
}

export async function rotateWebhookSecret(q: Db, tenantId: string, now: Date): Promise<string> {
  const secret = newWebhookSecret();
  const result = await q
    .updateTable('sagegames_tenants')
    .set({ webhook_secret: secret, updated_at: now })
    .where('id', '=', tenantId)
    .where('webhook_url', 'is not', null)
    .executeTakeFirst();
  if (changed(result) === 0) throw new HttpError(409, 'Set a webhook URL first', 'webhook_not_configured');
  return secret;
}

const newWebhookSecret = () => `whsec_${crypto.randomBytes(24).toString('hex')}`;

export async function usage(q: Db, tenantId: string, days: number, now: Date) {
  const since = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const day = utcDay(q, 's.created_at');
  const rows = await q
    .selectFrom('sagegames_game_sessions as s')
    .leftJoin('sagegames_game_results as r', 'r.session_id', 's.id')
    .select((eb) => [
      day.as('day'),
      eb.fn.count<number>('s.id').as('sessions'),
      eb.fn.count<number>('r.id').as('completed'),
      sql<number>`sum(case when ${sql.ref('r.is_valid')} then 1 else 0 end)`.as('verified'),
    ])
    .where('s.tenant_id', '=', tenantId)
    .where('s.created_at', '>=', since)
    .groupBy(day)
    .orderBy(day)
    .execute();
  return rows.map((r) => ({ day: r.day, sessions: Number(r.sessions), completed: Number(r.completed), verified: Number(r.verified ?? 0) }));
}
