import crypto from 'crypto';
import { generateApiKey, hashKeySecret, KeyMode, keyPreview, randomId } from '../auth/keys';
import { ALL_GAME_IDS } from '../catalog';
import { Db, one, Queryable } from '../db/db';
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
  q: Queryable,
  input: { name: string; ownerUserId?: string; gameIds: string[]; id?: string }
): Promise<string> {
  const id = input.id ?? randomId('app', 8);
  await q.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [id, input.name]);
  if (input.ownerUserId) {
    await q.query(`INSERT INTO tenant_members (tenant_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, input.ownerUserId]);
  }
  await setGameAccess(q, id, input.gameIds);
  return id;
}

/** Enable exactly `gameIds` for the tenant, keeping per-game default configs. */
export async function setGameAccess(q: Queryable, tenantId: string, gameIds: string[]): Promise<void> {
  const known = gameIds.filter((g) => ALL_GAME_IDS.includes(g));
  await q.query('UPDATE tenant_game_access SET is_enabled = FALSE WHERE tenant_id = $1', [tenantId]);
  for (const gameId of known) {
    await q.query(
      `INSERT INTO tenant_game_access (tenant_id, game_id, is_enabled) VALUES ($1, $2, TRUE)
       ON CONFLICT (tenant_id, game_id) DO UPDATE SET is_enabled = TRUE`,
      [tenantId, gameId]
    );
  }
}

/** Tenants named in SAGE_TENANT_KEYS must exist so their bootstrap keys can create sessions. */
export async function ensureBootstrapTenants(db: Db, tenantIds: string[]): Promise<void> {
  for (const id of tenantIds) {
    const exists = await one(db, 'SELECT 1 FROM tenants WHERE id = $1', [id]);
    if (!exists) {
      await db.tx((q) => createTenant(q, { id, name: id, gameIds: ALL_GAME_IDS }));
    }
  }
}

export async function requireMembership(q: Queryable, tenantId: string, userId: string): Promise<'owner' | 'admin'> {
  const row = await one<{ role: 'owner' | 'admin' }>(
    q,
    'SELECT role FROM tenant_members WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  if (!row) throw new HttpError(404, 'App not found', 'app_not_found');
  return row.role;
}

export async function listTenantsForUser(q: Queryable, userId: string): Promise<TenantSummary[]> {
  const rows = await q.query<{
    id: string;
    name: string;
    status: string;
    role: 'owner' | 'admin';
    webhook_url: string | null;
    created_at: Date;
    game_ids: string[] | null;
  }>(
    `SELECT t.id, t.name, t.status, m.role, t.webhook_url, t.created_at,
            ARRAY(SELECT game_id FROM tenant_game_access a WHERE a.tenant_id = t.id AND a.is_enabled ORDER BY game_id) AS game_ids
       FROM tenants t JOIN tenant_members m ON m.tenant_id = t.id
      WHERE m.user_id = $1
      ORDER BY t.created_at`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    role: r.role,
    gameIds: r.game_ids ?? [],
    webhookUrl: r.webhook_url,
    createdAt: new Date(r.created_at).toISOString(),
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
  input: { tenantId: string; mode: KeyMode; label: string; userId: string; pepper: string }
): Promise<ApiKeySummary & { key: string }> {
  const active = await one<{ n: number }>(
    db,
    'SELECT COUNT(*)::int AS n FROM api_keys WHERE tenant_id = $1 AND revoked_at IS NULL',
    [input.tenantId]
  );
  if ((active?.n ?? 0) >= MAX_ACTIVE_KEYS) {
    throw new HttpError(409, `An app can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`, 'too_many_keys');
  }

  const generated = generateApiKey(input.mode);
  const [row] = await db.query<{ created_at: Date }>(
    `INSERT INTO api_keys (id, tenant_id, mode, key_hash, label, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING created_at`,
    [generated.id, input.tenantId, input.mode, hashKeySecret(generated.secret, input.pepper), input.label, input.userId]
  );
  return {
    id: generated.id,
    mode: input.mode,
    label: input.label,
    preview: keyPreview(input.mode, generated.id),
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: null,
    revokedAt: null,
    key: generated.key,
  };
}

export async function listApiKeys(q: Queryable, tenantId: string): Promise<ApiKeySummary[]> {
  const rows = await q.query<{
    id: string;
    mode: KeyMode;
    label: string;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
  }>('SELECT id, mode, label, created_at, last_used_at, revoked_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC', [
    tenantId,
  ]);
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    label: r.label,
    preview: keyPreview(r.mode, r.id),
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: iso(r.last_used_at),
    revokedAt: iso(r.revoked_at),
  }));
}

export async function revokeApiKey(q: Queryable, tenantId: string, keyId: string): Promise<void> {
  const rows = await q.query(
    'UPDATE api_keys SET revoked_at = now() WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING id',
    [tenantId, keyId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Key not found or already revoked', 'key_not_found');
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
  q: Queryable,
  tenantId: string,
  url: string | null
): Promise<{ webhookUrl: string | null; webhookSecret: string | null }> {
  const [row] = await q.query<{ webhook_url: string | null; webhook_secret: string | null }>(
    `UPDATE tenants
        SET webhook_url = $2,
            webhook_secret = CASE WHEN $2::text IS NULL THEN NULL ELSE COALESCE(webhook_secret, $3) END,
            updated_at = now()
      WHERE id = $1
      RETURNING webhook_url, webhook_secret`,
    [tenantId, url, newWebhookSecret()]
  );
  return { webhookUrl: row.webhook_url, webhookSecret: row.webhook_secret };
}

export async function rotateWebhookSecret(q: Queryable, tenantId: string): Promise<string> {
  const [row] = await q.query<{ webhook_secret: string | null }>(
    `UPDATE tenants SET webhook_secret = $2, updated_at = now() WHERE id = $1 AND webhook_url IS NOT NULL RETURNING webhook_secret`,
    [tenantId, newWebhookSecret()]
  );
  if (!row) throw new HttpError(409, 'Set a webhook URL first', 'webhook_not_configured');
  return row.webhook_secret as string;
}

const newWebhookSecret = () => `whsec_${crypto.randomBytes(24).toString('hex')}`;

export async function usage(q: Queryable, tenantId: string, days: number, now: Date) {
  const since = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const rows = await q.query<{ day: string; sessions: number; completed: number; verified: number }>(
    `SELECT to_char(date_trunc('day', s.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS sessions,
            COUNT(r.id)::int AS completed,
            COUNT(r.id) FILTER (WHERE r.is_valid)::int AS verified
       FROM game_sessions s LEFT JOIN game_results r ON r.session_id = s.id
      WHERE s.tenant_id = $1 AND s.created_at >= $2
      GROUP BY 1 ORDER BY 1`,
    [tenantId, since]
  );
  return rows;
}
