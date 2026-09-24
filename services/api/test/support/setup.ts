import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import { SignJWT } from 'jose';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createSupabaseVerifier } from '../../src/auth/portalAuth';
import { syncCatalog } from '../../src/catalog';
import { AppConfig, testConfig } from '../../src/config';
import { Db, Queryable } from '../../src/db/db';
import { BootstrapKey, parseBootstrapKeys } from '../../src/http/auth';
import { createLogger } from '../../src/observability/logger';
import { AppContext } from '../../src/http/context';
import { ensureBootstrapTenants } from '../../src/services/tenants';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations');

/** Real Postgres (PGlite/WASM) with the Supabase migrations applied and a stub auth.users table. */
export async function createTestDb(): Promise<Db> {
  const pg = await PGlite.create();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
  `);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  await pg.exec('SET search_path TO sagegames, public');

  const wrap = (q: { query: PGlite['query'] }): Queryable => ({
    query: async <R>(text: string, params?: unknown[]) => (await q.query<R>(text, params as unknown[])).rows,
  });
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

export interface TestClock {
  now: () => Date;
  advance: (ms: number) => void;
  ms: () => number;
}

export function testClock(start = Date.UTC(2026, 8, 24, 12, 0, 0)): TestClock {
  let t = start;
  return { now: () => new Date(t), advance: (ms) => (t += ms), ms: () => t };
}

export interface TestEnv {
  db: Db;
  ctx: AppContext;
  clock: TestClock;
  config: AppConfig;
  api: ReturnType<typeof request>;
  /** Create a Supabase-style user and return an access token for the portal. */
  signIn: (email?: string) => Promise<{ userId: string; token: string }>;
  bootstrapKey: string;
  logs: Record<string, unknown>[];
}

export const BOOTSTRAP_KEY = 'sk_bootstrap_campus_key_0123456789';

export async function createTestEnv(configOverrides: Partial<AppConfig> = {}): Promise<TestEnv> {
  const db = await createTestDb();
  const config = testConfig(configOverrides);
  const clock = testClock();
  const logs: Record<string, unknown>[] = [];
  await syncCatalog(db);

  const bootstrapKeys: BootstrapKey[] = parseBootstrapKeys(`tenant_campus_app:${BOOTSTRAP_KEY}`);
  await ensureBootstrapTenants(db, ['tenant_campus_app']);

  const ctx: AppContext = {
    db,
    config,
    verifyPortalToken: createSupabaseVerifier(config),
    now: clock.now,
    // Captured (as parsed JSON entries) so tests can check what gets logged.
    logger: createLogger({ level: 'debug', format: 'json', write: (line) => logs.push(JSON.parse(line)) }),
  };
  const app = createApp(ctx, { bootstrapKeys });

  const signIn = async (email = `dev${crypto.randomBytes(3).toString('hex')}@example.com`) => {
    const userId = crypto.randomUUID();
    await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [userId, email]);
    const token = await new SignJWT({ email, role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(`${config.supabaseUrl}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(config.supabaseJwtSecret));
    return { userId, token };
  };

  return { db, ctx, clock, config, api: request(app), signIn, bootstrapKey: BOOTSTRAP_KEY, logs };
}
