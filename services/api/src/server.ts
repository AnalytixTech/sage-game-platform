/**
 * The SageGames API process: HTTP API, developer portal, battle WebSockets and webhook delivery.
 *
 *   node services/api/dist/server.js            (migrations must already be applied)
 *   node services/api/dist/server.js --migrate  (apply pending migrations first: simple hosts)
 */
import path from 'path';
import { createApp } from './app';
import { syncCatalog } from './catalog';
import { loadConfig } from './config';
import { createDb } from './db/db';
import { migrateToLatest, pendingMigrations } from './db/migrate';
import { createMailer } from './email/mailer';
import { parseBootstrapKeys } from './http/auth';
import { AppContext } from './http/context';
import { createLogger, Logger } from './observability/logger';
import { createSentryReporter, ErrorReporter } from './observability/sentry';
import { attachRealtime } from './realtime/wsServer';
import { MatchHub } from './realtime/MatchRoom';
import { startInstanceHeartbeat } from './services/instances';
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
  const db = await createDb(config.databaseUrl, { ssl: config.databaseSsl, poolSize: config.databasePoolSize });

  if (process.argv.includes('--migrate')) {
    const applied = await migrateToLatest(db);
    logger.info('migrations applied', { component: 'db', applied, database: config.databaseDialect });
  }
  const pending = await pendingMigrations(db);
  if (pending.length) {
    throw new Error(
      `Database migrations are pending (${pending.join(', ')}). Apply them with "npm run db:migrate" ` +
        '(node services/api/dist/scripts/migrate.js), or start with --migrate.'
    );
  }

  await syncCatalog(db);
  const aborted = await abortStaleMatches(db, new Date());
  if (aborted) logger.warn('marked interrupted matches as aborted', { component: 'matches', count: aborted });
  const bootstrapKeys = parseBootstrapKeys(config.bootstrapTenantKeys);
  await ensureBootstrapTenants(
    db,
    bootstrapKeys.map((k) => k.tenantId),
    new Date()
  );

  const mailer = createMailer({ brevoApiKey: config.brevoApiKey, emailFrom: config.emailFrom, production: config.env === 'production' }, logger);
  if (config.env === 'production' && !config.brevoApiKey) {
    logger.warn('BREVO_API_KEY is not set: portal sign-up and password reset emails cannot be sent', { component: 'email' });
  }

  const ctx: AppContext = { db, config, mailer, now: () => new Date(), logger };

  const app = createApp(ctx, {
    bootstrapKeys,
    portalDir: path.resolve(__dirname, '../../portal/dist'),
  });
  const stopWebhooks = startWebhookWorker(ctx);
  const instance = startInstanceHeartbeat(db, logger);
  const server = app.listen(config.port, () => {
    logger.info('listening', {
      port: config.port,
      env: config.env,
      database: config.databaseDialect,
      instance: instance.id,
      errorReporting: reporter ? 'sentry' : 'off',
    });
  });
  // Proxies (Railway, Render, nginx) keep idle connections for a while; outlast them so they never
  // reuse a socket Node has already closed.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  const realtime = attachRealtime(server, ctx, app.locals.matchHub as MatchHub);

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    stopWebhooks();
    void realtime.close();
    server.close(() => {
      Promise.allSettled([instance.stop(), reporter?.flush()])
        .then(() => db.destroy())
        .finally(() => process.exit(0));
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
