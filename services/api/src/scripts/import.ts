/**
 * Import a 2.x platform export (NDJSON, written by the export script) into a fresh database of any dialect.
 *
 *   DATABASE_URL=sqlite:./data/sagegames.db node services/api/dist/scripts/import.js sagegames-export.ndjson
 *
 * Applies the migrations first. API keys keep working as long as the new deployment uses the same
 * API_KEY_PEPPER. Portal accounts arrive without a password: their first sign-in emails them a link
 * to set one.
 */
import fs from 'fs';
import readline from 'readline';
import { syncCatalog } from '../catalog';
import { Db, json } from '../db/db';
import { migrateToLatest } from '../db/migrate';
import { Database } from '../db/types';
import { openDatabase, run } from './util';

export const EXPORT_FORMAT = 'sagegames-export';

/** Export tables, in an order that satisfies foreign keys, and their JSON columns. */
const TABLES: { name: string; table: keyof Database; json: string[]; drop?: string[] }[] = [
  { name: 'users', table: 'sagegames_users', json: [] },
  { name: 'tenants', table: 'sagegames_tenants', json: [] },
  { name: 'tenant_members', table: 'sagegames_tenant_members', json: [] },
  { name: 'api_keys', table: 'sagegames_api_keys', json: [] },
  { name: 'games', table: 'sagegames_games', json: ['supported_platforms'] },
  { name: 'tenant_game_access', table: 'sagegames_tenant_game_access', json: ['allowed_configurations'] },
  { name: 'matches', table: 'sagegames_matches', json: ['resolved_config', 'standings'] },
  { name: 'game_sessions', table: 'sagegames_game_sessions', json: ['resolved_config', 'metadata'] },
  { name: 'session_logs', table: 'sagegames_session_logs', json: ['log'] },
  { name: 'game_results', table: 'sagegames_game_results', json: ['result', 'flags'] },
  { name: 'player_stats', table: 'sagegames_player_stats', json: [] },
  { name: 'quiz_banks', table: 'sagegames_quiz_banks', json: ['questions'] },
  // Fresh ids (each dialect numbers its own rows); events keep their order.
  { name: 'webhook_deliveries', table: 'sagegames_webhook_deliveries', json: ['payload'], drop: ['id'] },
  { name: 'match_players', table: 'sagegames_match_players', json: [] },
];

export interface ImportSummary {
  counts: Record<string, number>;
  skipped: string[];
}

/** Turn an exported row into values for the new schema. */
function toValues(spec: (typeof TABLES)[number], row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (spec.drop?.includes(key)) continue;
    if (spec.json.includes(key)) out[key] = value === null && key === 'standings' ? null : json(value);
    else if (key.endsWith('_at') && typeof value === 'string') out[key] = new Date(value);
    else out[key] = value;
  }
  return out;
}

/** Import an export file into `db` (migrated here). The database must not have portal accounts or apps yet. */
export async function importExport(db: Db, file: string, log: (line: string) => void = () => undefined): Promise<ImportSummary> {
  await migrateToLatest(db);
  const existing = await db.selectFrom('sagegames_users').select('id').limit(1).execute();
  const tenants = await db.selectFrom('sagegames_tenants').select('id').limit(1).execute();
  if (existing.length || tenants.length) throw new Error('The target database already has accounts or apps. Import into a fresh database.');

  // Read everything first, grouped by table, so rows go in foreign-key order whatever the file order.
  const rows = new Map<string, Record<string, unknown>[]>();
  let header: { format?: string; version?: number } | null = null;
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { format?: string; version?: number; table?: string; row?: Record<string, unknown> };
    if (!header) {
      header = entry;
      if (entry.format !== EXPORT_FORMAT || entry.version !== 1) throw new Error(`${file} is not a SageGames export (version 1)`);
      continue;
    }
    if (!entry.table || !entry.row) continue;
    rows.set(entry.table, [...(rows.get(entry.table) ?? []), entry.row]);
  }
  if (!header) throw new Error(`${file} is empty`);

  const summary: ImportSummary = { counts: {}, skipped: [] };
  await syncCatalog(db);
  const knownGames = new Set((await db.selectFrom('sagegames_games').select('id').execute()).map((g) => g.id));
  const seenEmails = new Set<string>();

  await db.transaction().execute(async (q) => {
    for (const spec of TABLES) {
      let list = rows.get(spec.name) ?? [];
      if (spec.name === 'games') list = list.filter((g) => !knownGames.has(String(g.id))); // the catalog comes from code
      if (spec.name === 'users') {
        list = list.filter((u) => {
          const email = String(u.email).trim().toLowerCase();
          if (seenEmails.has(email)) {
            summary.skipped.push(`user ${String(u.id)} (${email}): another account has the same email`);
            return false;
          }
          seenEmails.add(email);
          u.email = email;
          return true;
        });
      }
      for (let i = 0; i < list.length; i += 200) {
        const chunk = list.slice(i, i + 200).map((r) => toValues(spec, r));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await q.insertInto(spec.table).values(chunk as any).execute();
      }
      summary.counts[spec.name] = list.length;
      if (list.length) log(`${spec.name}: ${list.length}`);
    }
  });
  return summary;
}

if (typeof require !== 'undefined' && require.main === module) {
  run(async () => {
    const [file] = process.argv.slice(2);
    if (!file) {
      console.error('Usage: import <export.ndjson>');
      process.exit(2);
    }
    const db = await openDatabase();
    try {
      const summary = await importExport(db, file, (line) => console.log(line));
      for (const s of summary.skipped) console.warn(`skipped ${s}`);
      console.log('Import complete. Use the same API_KEY_PEPPER as the old deployment so existing API keys keep working.');
    } finally {
      await db.destroy();
    }
  });
}
