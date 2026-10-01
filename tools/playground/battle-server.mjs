// Dev-only battle server for the playground: the real API (services/api/dist) on an in-memory
// database (SQLite by default; BATTLE_DB=pglite://memory for Postgres) with the real migrations,
// plus POST /dev/battle to set up a match.
//   npm run build:packages && node tools/playground/battle-server.mjs
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const api = (p) => require(path.join(root, 'services/api/dist', p));
const { createApp } = api('app.js');
const { testConfig } = api('config.js');
const { syncCatalog } = api('catalog.js');
const { attachRealtime } = api('realtime/wsServer.js');
const { createTenant, createApiKey } = api('services/tenants.js');
const { ALL_GAME_IDS } = api('catalog.js');
const { createLogger } = api('observability/logger.js');
const { createDb } = api('db/db.js');
const { migrateToLatest } = api('db/migrate.js');
const { createMailer } = api('email/mailer.js');

const PORT = Number(process.env.PORT ?? 4100);

const db = await createDb(process.env.BATTLE_DB ?? 'sqlite::memory:');
await migrateToLatest(db);

const config = testConfig({ env: 'development' });
await syncCatalog(db);
await db.transaction().execute((q) => createTenant(q, { id: 'dev_app', name: 'Playground', gameIds: ALL_GAME_IDS }, new Date()));
const { key } = await createApiKey(db, { tenantId: 'dev_app', mode: 'live', label: 'dev', userId: null, pepper: config.apiKeyPepper }, new Date());

const logger = createLogger({ level: 'warn', format: 'pretty' });
const ctx = { db, config, mailer: createMailer({ production: false }, logger), now: () => new Date(), logger };
const app = createApp(ctx, { realtime: { countdownMs: 3000, graceMs: 30_000, tickMs: 250, lingerMs: 120_000 } });

const call = async (method, url, body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${url}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

// POST /dev/battle { gameId, players } → seats for each player (+ seed/config for scripted play)
const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/dev/battle')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { gameId = 'game_memory_001', players = 2, config } = raw ? JSON.parse(raw) : {};
    const names = ['Ada', 'Bayo', 'Chidi', 'Dayo'].slice(0, players);
    const match = await call('POST', '/v2/matches', {
      gameId,
      players: names.map((n) => ({ externalUserId: n.toLowerCase(), displayName: n })),
      contextId: 'group:playground',
      config,
    });
    const seats = [];
    for (const n of names) seats.push(await call('POST', `/v2/matches/${match.matchId}/tokens`, { externalUserId: n.toLowerCase() }));
    const row = await db.selectFrom('sagegames_matches').select(['seed', 'resolved_config']).where('id', '=', match.matchId).executeTakeFirstOrThrow();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ matchId: match.matchId, seats, names, seed: row.seed, config: row.resolved_config }));
  }
  app(req, res);
});
attachRealtime(server, ctx, app.locals.matchHub);
server.listen(PORT, () => console.log(`battle server on http://127.0.0.1:${PORT}`));
