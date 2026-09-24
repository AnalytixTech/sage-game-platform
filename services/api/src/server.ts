import path from 'path';
import { createApp } from './app';
import { createSupabaseVerifier } from './auth/portalAuth';
import { syncCatalog } from './catalog';
import { loadConfig } from './config';
import { createPgDb, one } from './db/db';
import { parseBootstrapKeys } from './http/auth';
import { AppContext } from './http/context';
import { attachRealtime } from './realtime/wsServer';
import { MatchHub } from './realtime/MatchRoom';
import { abortStaleMatches } from './services/matches';
import { ensureBootstrapTenants } from './services/tenants';
import { startWebhookWorker } from './webhooks/dispatcher';

async function main() {
  const config = loadConfig();
  const db = createPgDb(config.databaseUrl, config.databaseSsl);

  const schema = await one<{ games: string | null }>(db, `SELECT to_regclass('sagegames.games')::text AS games`);
  if (!schema?.games) {
    throw new Error('Database schema is missing. Apply migrations with: npx supabase db push');
  }

  await syncCatalog(db);
  const aborted = await abortStaleMatches(db);
  if (aborted) console.log(`Marked ${aborted} interrupted match(es) as aborted`);
  const bootstrapKeys = parseBootstrapKeys(config.bootstrapTenantKeys);
  await ensureBootstrapTenants(db, bootstrapKeys.map((k) => k.tenantId));

  const ctx: AppContext = {
    db,
    config,
    verifyPortalToken: createSupabaseVerifier(config),
    now: () => new Date(),
    log: (message, extra) => console.error(message, extra ?? ''),
  };

  const app = createApp(ctx, {
    bootstrapKeys,
    portalDir: path.resolve(__dirname, '../../portal/dist'),
  });
  const stopWebhooks = startWebhookWorker(ctx);
  const server = app.listen(config.port, () => {
    console.log(`SageGames API listening on :${config.port} (${config.env})`);
  });
  const realtime = attachRealtime(server, ctx, app.locals.matchHub as MatchHub);

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    stopWebhooks();
    void realtime.close();
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
