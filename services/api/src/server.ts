import path from 'path';
import { createApp } from './app';
import { createSupabaseVerifier } from './auth/portalAuth';
import { syncCatalog } from './catalog';
import { loadConfig } from './config';
import { createPgDb, REQUIRED_TABLES } from './db/db';
import { parseBootstrapKeys } from './http/auth';
import { AppContext } from './http/context';
import { createLogger, Logger } from './observability/logger';
import { createSentryReporter, ErrorReporter } from './observability/sentry';
import { attachRealtime } from './realtime/wsServer';
import { MatchHub } from './realtime/MatchRoom';
import { abortStaleMatches } from './services/matches';
import { ensureBootstrapTenants } from './services/tenants';
import { startWebhookWorker } from './webhooks/dispatcher';

// Until the config is loaded, failures go to a plain JSON logger.
let logger: Logger = createLogger();
let reporter: ErrorReporter | null = null;

async function main() {
  const config = loadConfig();
  reporter = config.sentryDsn
    ? await createSentryReporter({ dsn: config.sentryDsn, environment: config.env, release: config.release })
    : null;
  logger = createLogger({
    level: config.logLevel,
    format: config.logFormat,
    bindings: { service: 'sagegames-api', ...(config.release ? { release: config.release.slice(0, 12) } : {}) },
    onError: reporter ? (err, msg, fields) => reporter!.capture(err, msg, fields) : undefined,
  });
  const db = createPgDb(config.databaseUrl, config.databaseSsl);

  const missing = await db.query<{ name: string }>(
    `SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass('sagegames.' || name) IS NULL`,
    [REQUIRED_TABLES]
  );
  if (missing.length) {
    throw new Error(
      `Database migrations are missing (no table ${missing.map((m) => m.name).join(', ')}). ` +
        'Apply them with: npx supabase db push'
    );
  }

  await syncCatalog(db);
  const aborted = await abortStaleMatches(db);
  if (aborted) logger.warn('marked interrupted matches as aborted', { component: 'matches', count: aborted });
  const bootstrapKeys = parseBootstrapKeys(config.bootstrapTenantKeys);
  await ensureBootstrapTenants(db, bootstrapKeys.map((k) => k.tenantId));

  const ctx: AppContext = {
    db,
    config,
    verifyPortalToken: createSupabaseVerifier(config),
    now: () => new Date(),
    logger,
  };

  const app = createApp(ctx, {
    bootstrapKeys,
    portalDir: path.resolve(__dirname, '../../portal/dist'),
  });
  const stopWebhooks = startWebhookWorker(ctx);
  const server = app.listen(config.port, () => {
    logger.info('listening', { port: config.port, env: config.env, errorReporting: reporter ? 'sentry' : 'off' });
  });
  const realtime = attachRealtime(server, ctx, app.locals.matchHub as MatchHub);

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    stopWebhooks();
    void realtime.close();
    server.close(() => {
      Promise.allSettled([db.close(), reporter?.flush()]).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Anything that escapes a handler is a bug: log it (and report it) rather than die silently.
process.on('unhandledRejection', (err) => logger.error('unhandled promise rejection', { err }));
process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', { err });
  void (reporter?.flush() ?? Promise.resolve()).finally(() => process.exit(1));
});

main().catch((err) => {
  logger.error('startup failed', { err });
  void (reporter?.flush() ?? Promise.resolve()).finally(() => process.exit(1));
});
