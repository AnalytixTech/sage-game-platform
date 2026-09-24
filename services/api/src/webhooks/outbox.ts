import crypto from 'crypto';
import { Queryable } from '../db/db';

export type WebhookEvent = 'session.completed' | 'match.finished';

/** Queue an event for the tenant (no-op when the tenant has no webhook URL). Call inside the business transaction. */
export async function enqueueWebhook(q: Queryable, tenantId: string, event: WebhookEvent, data: unknown): Promise<void> {
  await q.query(
    `INSERT INTO webhook_deliveries (tenant_id, event_type, payload)
     SELECT id, $2, $3 FROM tenants WHERE id = $1 AND webhook_url IS NOT NULL`,
    [tenantId, event, JSON.stringify(data)]
  );
}

/** Signature header value: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>. */
export function signWebhook(secret: string, body: string, timestamp: number): string {
  const mac = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/** Verify a signature (for hosts; also used in tests). Rejects signatures older than toleranceSec. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300
): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec || !parts.v1) return false;
  const expected = signWebhook(secret, body, t).split('v1=')[1];
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
