import { z } from 'zod';
import { DEFAULT_SCRYPT_COST } from './auth/passwords';
import { dialectForUrl, DialectName } from './db/db';

const DEV_PEPPER = 'sagegames-development-pepper-not-for-production';
const DEV_JWT_SECRET = 'sagegames-development-jwt-secret-not-for-production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** postgres://…, mysql://…, sqlite:./data/sagegames.db (or file:…). */
  DATABASE_URL: z.string().min(1),
  /** 'auto' enables TLS for Postgres/MySQL hosts other than localhost (and private network names). */
  DATABASE_SSL: z.enum(['auto', 'true', 'false']).default('auto'),
  /** Connections to keep open (Postgres and MySQL). Lower it on small plans or behind a pooler. */
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  /** Secret mixed into API key hashes. Changing it invalidates every issued key. */
  API_KEY_PEPPER: z.string().min(32).optional(),
  /** Signs portal access tokens (HS256). 32+ characters; required in production. */
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  /** Public URL of this service (the portal is served at /portal; email links point here). */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /** Brevo transactional email (account emails). Without it, development logs the links. */
  BREVO_API_KEY: z.string().optional(),
  /** Sender, e.g. "SageGames <no-reply@example.com>". */
  EMAIL_FROM: z.string().optional(),
  /** Bootstrap keys "tenant_id:secret,..." kept working until tenants are on portal-issued keys. */
  SAGE_TENANT_KEYS: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /** 'json' (one object per line) by default in production, readable lines elsewhere. */
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  /** Report unexpected errors to Sentry. Unset: errors are only logged. */
  SENTRY_DSN: z.string().url().optional(),
  /** Deployed version for logs and Sentry; falls back to the host's commit variable. */
  RELEASE: z.string().optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  RENDER_GIT_COMMIT: z.string().optional(),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  databaseDialect: DialectName;
  databaseSsl: boolean;
  databasePoolSize: number;
  apiKeyPepper: string;
  authJwtSecret: string;
  publicBaseUrl: string;
  brevoApiKey?: string;
  emailFrom?: string;
  bootstrapTenantKeys?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  logFormat: 'json' | 'pretty';
  sentryDsn?: string;
  release?: string;
  /** scrypt cost for new password hashes (lower in tests). */
  passwordCost: number;
}

/** Local or private-network database hosts don't need TLS by default. */
function isPrivateHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /^(localhost|127\.|10\.|192\.168\.|::1$|\[::1\])/.test(host) || host.endsWith('.internal') || host.endsWith('.local') || !host.includes('.');
  } catch {
    return false;
  }
}

/** TLS setting for a database URL ('auto' turns it on for Postgres/MySQL on public hosts). */
export function databaseSslFor(url: string, setting: string | undefined = 'auto'): boolean {
  if (dialectForUrl(url) === 'sqlite' || /^pglite:/i.test(url)) return false;
  return setting === 'auto' || !setting ? !isPrivateHost(url) : setting === 'true';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // An empty variable (SENTRY_DSN= in a .env file) means "not set".
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const c = parsed.data;
  const production = c.NODE_ENV === 'production';

  if (production && !c.API_KEY_PEPPER) throw new Error('API_KEY_PEPPER (32+ characters) is required in production');
  if (production && !c.AUTH_JWT_SECRET) throw new Error('AUTH_JWT_SECRET (32+ characters) is required in production');

  const dialect = dialectForUrl(c.DATABASE_URL);
  return {
    env: c.NODE_ENV,
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    databaseDialect: dialect,
    databaseSsl: databaseSslFor(c.DATABASE_URL, c.DATABASE_SSL),
    databasePoolSize: c.DATABASE_POOL_SIZE,
    apiKeyPepper: c.API_KEY_PEPPER ?? DEV_PEPPER,
    authJwtSecret: c.AUTH_JWT_SECRET ?? DEV_JWT_SECRET,
    publicBaseUrl: (c.PUBLIC_BASE_URL ?? `http://localhost:${c.PORT}`).replace(/\/$/, ''),
    brevoApiKey: c.BREVO_API_KEY,
    emailFrom: c.EMAIL_FROM,
    bootstrapTenantKeys: c.SAGE_TENANT_KEYS,
    logLevel: c.LOG_LEVEL,
    logFormat: c.LOG_FORMAT ?? (production ? 'json' : 'pretty'),
    sentryDsn: c.SENTRY_DSN,
    release: c.RELEASE ?? c.RAILWAY_GIT_COMMIT_SHA ?? c.RENDER_GIT_COMMIT,
    passwordCost: DEFAULT_SCRYPT_COST,
  };
}

/** Config for tests. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    port: 0,
    databaseUrl: 'sqlite::memory:',
    databaseDialect: 'sqlite',
    databaseSsl: false,
    databasePoolSize: 5,
    apiKeyPepper: DEV_PEPPER,
    authJwtSecret: 'test-jwt-secret-with-at-least-32-characters!!',
    publicBaseUrl: 'http://localhost:4000',
    logLevel: 'silent',
    logFormat: 'json',
    passwordCost: 2 ** 10,
    ...overrides,
  };
}
