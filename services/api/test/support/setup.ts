/**
 * Test environments on any supported database. SAGE_TEST_DB picks it:
 *
 *   sqlite    in-memory SQLite (default)
 *   pglite    in-memory Postgres (WASM)
 *   mysql     a fresh database on the server at TEST_MYSQL_URL     (e.g. mysql://root:pw@127.0.0.1:3306)
 *   postgres  a fresh database on the server at TEST_POSTGRES_URL  (e.g. postgres://postgres:pw@127.0.0.1:5432/postgres)
 *
 * Every environment gets its own empty database with the migrations applied.
 */
import crypto from 'crypto';
import { sql } from 'kysely';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createVerifiedUser, signAccessToken } from '../../src/auth/accounts';
import { syncCatalog } from '../../src/catalog';
import { AppConfig, testConfig } from '../../src/config';
import { createDb, Db } from '../../src/db/db';
import { migrateToLatest } from '../../src/db/migrate';
import { memoryMailer } from '../../src/email/mailer';
import { BootstrapKey, parseBootstrapKeys } from '../../src/http/auth';
import { createLogger } from '../../src/observability/logger';
import { AppContext } from '../../src/http/context';
import { ensureBootstrapTenants } from '../../src/services/tenants';

export type TestDialect = 'sqlite' | 'pglite' | 'mysql' | 'postgres';
export const TEST_DIALECT = (process.env.SAGE_TEST_DB ?? 'sqlite') as TestDialect;

/** A server URL with a different database name. */
function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** An empty, migrated database on the configured dialect, and a function that removes it. */
export async function createTestDb(): Promise<{ db: Db; drop: () => Promise<void> }> {
  if (TEST_DIALECT === 'sqlite' || TEST_DIALECT === 'pglite') {
    const db = await createDb(TEST_DIALECT === 'sqlite' ? 'sqlite::memory:' : 'pglite://memory');
    await migrateToLatest(db);
    return { db, drop: () => db.destroy() };
  }

  const server = TEST_DIALECT === 'mysql' ? process.env.TEST_MYSQL_URL : process.env.TEST_POSTGRES_URL;
  if (!server) throw new Error(`SAGE_TEST_DB=${TEST_DIALECT} needs ${TEST_DIALECT === 'mysql' ? 'TEST_MYSQL_URL' : 'TEST_POSTGRES_URL'}`);
  const name = `sgtest_${crypto.randomBytes(6).toString('hex')}`;
  const admin = await createDb(server, { poolSize: 1 });
  await sql`create database ${sql.id(name)}`.execute(admin);
  await admin.destroy();
  const db = await createDb(withDatabase(server, name), { poolSize: 5 });
  await migrateToLatest(db);
  return {
    db,
    drop: async () => {
      await db.destroy();
      const cleanup = await createDb(server, { poolSize: 1 });
      await sql`drop database if exists ${sql.id(name)}`.execute(cleanup);
      await cleanup.destroy();
    },
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
  /** Emails the API sent. */
  mail: ReturnType<typeof memoryMailer>;
  /** Create a verified portal account and return an access token for it. */
  signIn: (email?: string) => Promise<{ userId: string; token: string; email: string }>;
  bootstrapKey: string;
  logs: Record<string, unknown>[];
  /** Remove the environment's database. */
  close: () => Promise<void>;
}

export const BOOTSTRAP_KEY = 'sk_bootstrap_campus_key_0123456789';
export const TEST_PASSWORD = 'Correct-horse-9';

export async function createTestEnv(configOverrides: Partial<AppConfig> = {}): Promise<TestEnv> {
  const { db, drop } = await createTestDb();
  const config = testConfig(configOverrides);
  const clock = testClock();
  const logs: Record<string, unknown>[] = [];
  const mail = memoryMailer();
  await syncCatalog(db, clock.now());

  const bootstrapKeys: BootstrapKey[] = parseBootstrapKeys(`tenant_campus_app:${BOOTSTRAP_KEY}`);
  await ensureBootstrapTenants(db, ['tenant_campus_app'], clock.now());

  const ctx: AppContext = {
    db,
    config,
    mailer: mail,
    now: clock.now,
    // Captured (as parsed JSON entries) so tests can check what gets logged.
    logger: createLogger({ level: 'debug', format: 'json', write: (line) => logs.push(JSON.parse(line)) }),
  };
  const app = createApp(ctx, { bootstrapKeys });

  const signIn = async (email = `dev${crypto.randomBytes(3).toString('hex')}@example.com`) => {
    // ctx.now, not clock.now: some tests switch the context to real time.
    const user = await createVerifiedUser({ db, config, now: () => ctx.now() }, email, TEST_PASSWORD);
    const token = await signAccessToken(config, { ...user, token_epoch: 0 }, ctx.now());
    return { userId: user.id, token, email: user.email };
  };

  return { db, ctx, clock, config, api: request(app), mail, signIn, bootstrapKey: BOOTSTRAP_KEY, logs, close: drop };
}
