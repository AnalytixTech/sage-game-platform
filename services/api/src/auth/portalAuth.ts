import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { AppConfig } from '../config';

export interface PortalUser {
  id: string;
  email: string;
}

export type PortalTokenVerifier = (token: string) => Promise<PortalUser | null>;

/**
 * Verifies Supabase Auth access tokens sent by the developer portal.
 * Uses the project's JWKS (asymmetric signing keys), or the legacy HS256 secret when configured.
 */
export function createSupabaseVerifier(config: AppConfig): PortalTokenVerifier {
  const issuer = `${config.supabaseUrl}/auth/v1`;
  const key = config.supabaseJwtSecret
    ? new TextEncoder().encode(config.supabaseJwtSecret)
    : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], {
        issuer,
        audience: 'authenticated',
      });
      return toUser(payload);
    } catch {
      return null;
    }
  };
}

function toUser(payload: JWTPayload): PortalUser | null {
  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!payload.sub || payload.role !== 'authenticated') return null;
  return { id: payload.sub, email };
}
