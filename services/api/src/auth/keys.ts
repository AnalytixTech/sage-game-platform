import crypto from 'crypto';

export type KeyMode = 'live' | 'test';

export interface ParsedApiKey {
  mode: KeyMode;
  id: string;
  secret: string;
}

const KEY_PATTERN = /^sk_(live|test)_([0-9a-f]{16})_([0-9a-f]{48})$/;

/** Generate a host API key: sk_<mode>_<16 hex id>_<48 hex secret>. */
export function generateApiKey(mode: KeyMode): ParsedApiKey & { key: string } {
  const id = crypto.randomBytes(8).toString('hex');
  const secret = crypto.randomBytes(24).toString('hex');
  return { mode, id, secret, key: `sk_${mode}_${id}_${secret}` };
}

export function parseApiKey(key: string): ParsedApiKey | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  return { mode: match[1] as KeyMode, id: match[2], secret: match[3] };
}

/** Keys are random, so a peppered HMAC is enough (no slow hash needed). */
export function hashKeySecret(secret: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(secret).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Display form, e.g. "sk_live_3f9a…c2d1" (never the secret). */
export function keyPreview(mode: KeyMode, id: string): string {
  return `sk_${mode}_${id}_…`;
}

export const sha256Hex = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export const randomId = (prefix: string, bytes = 12): string => `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`;

/** Session tokens handed to the player's app. Stored only as a SHA-256 digest. */
export function generateSessionToken(): { token: string; hash: string } {
  const token = `stk_${crypto.randomBytes(32).toString('hex')}`;
  return { token, hash: sha256Hex(token) };
}
