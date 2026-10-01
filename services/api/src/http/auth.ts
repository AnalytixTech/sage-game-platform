import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { Selectable } from 'kysely';
import { verifyAccessToken } from '../auth/accounts';
import { hashKeySecret, parseApiKey, safeEqualHex, sha256Hex } from '../auth/keys';
import { GameSessionsTable } from '../db/types';
import { AppContext, HostAuth } from './context';
import { asyncHandler, HttpError } from './errors';

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Bootstrap keys from SAGE_TENANT_KEYS, kept only as digests. */
export interface BootstrapKey {
  tenantId: string;
  digest: Buffer;
}

export function parseBootstrapKeys(raw: string | undefined): BootstrapKey[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const sep = pair.indexOf(':');
      const tenantId = pair.slice(0, sep).trim();
      const secret = pair.slice(sep + 1).trim();
      if (sep <= 0 || secret.length < 24) {
        throw new Error(`SAGE_TENANT_KEYS entry for '${tenantId || pair}' is malformed or shorter than 24 chars`);
      }
      return { tenantId, digest: crypto.createHash('sha256').update(secret).digest() };
    });
}

const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export function createAuth(ctx: AppContext, bootstrapKeys: BootstrapKey[]) {
  const recentlyTouched = new Map<string, number>();

  /** Resolve a host key to its tenant, or null. */
  async function resolveHostKey(key: string): Promise<HostAuth | null> {
    const parsed = parseApiKey(key);
    if (parsed) {
      const row = await ctx.db
        .selectFrom('sagegames_api_keys as k')
        .innerJoin('sagegames_tenants as t', 't.id', 'k.tenant_id')
        .select(['k.tenant_id', 'k.key_hash', 'k.mode'])
        .where('k.id', '=', parsed.id)
        .where('k.revoked_at', 'is', null)
        .where('t.status', '=', 'active')
        .executeTakeFirst();
      if (!row || row.mode !== parsed.mode) return null;
      if (!safeEqualHex(row.key_hash, hashKeySecret(parsed.secret, ctx.config.apiKeyPepper))) return null;

      const now = Date.now();
      if ((recentlyTouched.get(parsed.id) ?? 0) < now - LAST_USED_WRITE_INTERVAL_MS) {
        recentlyTouched.set(parsed.id, now);
        ctx.db
          .updateTable('sagegames_api_keys')
          .set({ last_used_at: ctx.now() })
          .where('id', '=', parsed.id)
          .execute()
          .catch(() => undefined);
      }
      return { tenantId: row.tenant_id, isTest: parsed.mode === 'test', keyId: parsed.id };
    }

    const digest = crypto.createHash('sha256').update(key).digest();
    let match: BootstrapKey | null = null;
    for (const entry of bootstrapKeys) {
      if (crypto.timingSafeEqual(entry.digest, digest)) match = entry;
    }
    return match ? { tenantId: match.tenantId, isTest: false, keyId: null } : null;
  }

  /** Server-to-server routes: require a host API key. */
  const requireHost = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const key = bearerToken(req);
    if (!key) throw new HttpError(401, 'Missing or invalid Authorization header', 'unauthorized');
    const host = await resolveHostKey(key);
    if (!host) throw new HttpError(403, 'Invalid or revoked API key', 'invalid_api_key');
    res.locals.host = host;
    next();
  });

  /** Public routes that narrow their output when a valid host key is present. */
  const optionalHost = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const key = bearerToken(req);
    if (key) res.locals.host = await resolveHostKey(key);
    next();
  });

  /**
   * Player routes: require the session token for the :sessionId in the URL.
   * `graceMs` lets a game that finished right at expiry still submit its result.
   */
  const requireSession = (graceMs = 0) =>
    asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      const token = bearerToken(req);
      if (!token) throw new HttpError(401, 'Missing session token', 'unauthorized');
      const session = await ctx.db
        .selectFrom('sagegames_game_sessions')
        .selectAll()
        .where('session_token_hash', '=', sha256Hex(token))
        .executeTakeFirst();
      if (!session || session.id !== req.params.sessionId) {
        throw new HttpError(401, 'Invalid session token', 'invalid_session_token');
      }
      if (session.expires_at.getTime() + graceMs <= ctx.now().getTime()) {
        throw new HttpError(401, 'Session token has expired', 'session_expired');
      }
      res.locals.session = session;
      next();
    });

  /** The portal user for an access token (checks the account still exists and the token isn't revoked). */
  const portalUserFor = (token: string) => verifyAccessToken(ctx, token);

  /** Developer portal routes: require a portal access token. */
  const requirePortalUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const user = token ? await portalUserFor(token) : null;
    if (!user) throw new HttpError(401, 'Please sign in again', 'unauthorized');
    res.locals.user = user;
    next();
  });

  return { resolveHostKey, requireHost, optionalHost, requireSession, requirePortalUser, portalUserFor };
}

export type SessionRow = Selectable<GameSessionsTable>;
