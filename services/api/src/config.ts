import { z } from 'zod';

const DEV_PEPPER = 'sagegames-development-pepper-not-for-production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Supabase session-pooler (port 5432) or direct connection string. */
  DATABASE_URL: z.string().min(1),
  /** 'auto' enables SSL for any host other than localhost. */
  DATABASE_SSL: z.enum(['auto', 'true', 'false']).default('auto'),
  /** Secret mixed into API key hashes. Changing it invalidates every issued key. */
  API_KEY_PEPPER: z.string().min(32).optional(),
  /** Public URL of this service (the portal is served at /portal). */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /** e.g. https://abcd1234.supabase.co */
  SUPABASE_URL: z.string().url(),
  /** Supabase publishable (anon) key; safe to expose to the portal in the browser. */
  SUPABASE_ANON_KEY: z.string().min(1),
  /** Legacy HS256 JWT secret. Leave unset for projects using asymmetric signing keys (JWKS). */
  SUPABASE_JWT_SECRET: z.string().optional(),
  /** Bootstrap keys "tenant_id:secret,..." kept working until tenants are on portal-issued keys. */
  SAGE_TENANT_KEYS: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /** 'json' (one object per line) by default in production, readable lines elsewhere. */
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  /** Report unexpected errors to Sentry. Unset: errors are only logged. */
  SENTRY_DSN: z.string().url().optional(),
  /** Set by Render; tags Sentry reports with the deployed commit. */
  RENDER_GIT_COMMIT: z.string().optional(),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  apiKeyPepper: string;
  publicBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseJwtSecret?: string;
  bootstrapTenantKeys?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  logFormat: 'json' | 'pretty';
  sentryDsn?: string;
  release?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // An empty variable (SENTRY_DSN= in a .env file) means "not set".
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const c = parsed.data;

  if (c.NODE_ENV === 'production' && !c.API_KEY_PEPPER) {
    throw new Error('API_KEY_PEPPER (32+ characters) is required in production');
  }

  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(c.DATABASE_URL);
  return {
    env: c.NODE_ENV,
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    databaseSsl: c.DATABASE_SSL === 'auto' ? !isLocal : c.DATABASE_SSL === 'true',
    apiKeyPepper: c.API_KEY_PEPPER ?? DEV_PEPPER,
    publicBaseUrl: (c.PUBLIC_BASE_URL ?? `http://localhost:${c.PORT}`).replace(/\/$/, ''),
    supabaseUrl: c.SUPABASE_URL.replace(/\/$/, ''),
    supabaseAnonKey: c.SUPABASE_ANON_KEY,
    supabaseJwtSecret: c.SUPABASE_JWT_SECRET,
    bootstrapTenantKeys: c.SAGE_TENANT_KEYS,
    logLevel: c.LOG_LEVEL,
    logFormat: c.LOG_FORMAT ?? (c.NODE_ENV === 'production' ? 'json' : 'pretty'),
    sentryDsn: c.SENTRY_DSN,
    release: c.RENDER_GIT_COMMIT,
  };
}

/** Config for tests. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    port: 0,
    databaseUrl: 'pglite://memory',
    databaseSsl: false,
    apiKeyPepper: DEV_PEPPER,
    publicBaseUrl: 'http://localhost:4000',
    supabaseUrl: 'https://test-project.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    supabaseJwtSecret: 'test-jwt-secret-with-at-least-32-characters!!',
    logLevel: 'silent',
    logFormat: 'json',
    ...overrides,
  };
}
