/**
 * Export a SageGames 2.x deployment (Postgres on Supabase, `sagegames` schema) for import into 3.0.
 *
 *   SOURCE_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres \
 *     node services/api/dist/scripts/export-supabase.js sagegames-export.ndjson
 *
 * Reads every platform table, and the portal accounts' ids, emails and confirmation dates from
 * Supabase Auth (auth.users). Passwords stay behind (they can't be moved): accounts set a new one
 * on their first sign-in. Read-only: nothing is changed in the source database.
 */
import fs from 'fs';
import { databaseSslFor } from '../config';
import { EXPORT_FORMAT } from './import';
import { run } from './util';

/** Tables of the 2.x `sagegames` schema, in foreign-key order. */
const LEGACY_TABLES = [
  'tenants',
  'tenant_members',
  'api_keys',
  'games',
  'tenant_game_access',
  'matches',
  'game_sessions',
  'session_logs',
  'game_results',
  'player_stats',
  'quiz_banks',
  'webhook_deliveries',
  'match_players',
];

type Query = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const BATCH = 1000;

/** JSON-safe values: timestamps as ISO strings, BIGINTs as numbers. */
function plain(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

/** Write the export as NDJSON lines: a header, then { table, row } per row. Returns row counts. */
export async function exportLegacy(query: Query, write: (line: string) => void, now = new Date()): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  write(JSON.stringify({ format: EXPORT_FORMAT, version: 1, exportedAt: now.toISOString(), source: 'sagegames-2.x' }));

  // Portal accounts: only the people who belong to an app (or created a key) are needed.
  const users = await query(
    `SELECT u.id::text AS id, lower(u.email) AS email, u.email_confirmed_at, u.created_at
       FROM auth.users u
      WHERE u.email IS NOT NULL
        AND (EXISTS (SELECT 1 FROM sagegames.tenant_members m WHERE m.user_id = u.id)
             OR EXISTS (SELECT 1 FROM sagegames.api_keys k WHERE k.created_by = u.id))
      ORDER BY u.created_at, u.id`
  );
  for (const u of users.rows) {
    const created = u.created_at ?? now;
    write(
      JSON.stringify({
        table: 'users',
        row: plain({
          id: u.id,
          email: u.email,
          password_hash: null, // set on first sign-in, by email
          email_verified_at: u.email_confirmed_at ?? null,
          created_at: created,
          updated_at: created,
        }),
      })
    );
  }
  counts.users = users.rows.length;

  for (const table of LEGACY_TABLES) {
    let n = 0;
    for (let offset = 0; ; offset += BATCH) {
      const { rows } = await query(`SELECT * FROM sagegames.${table} ORDER BY 1 LIMIT ${BATCH} OFFSET ${offset}`);
      for (const row of rows) {
        const r = plain(row);
        if (table === 'tenant_members') r.user_id = String(r.user_id);
        if (table === 'api_keys' && r.created_by) r.created_by = String(r.created_by);
        if (table === 'quiz_banks') r.created_by = null;
        write(JSON.stringify({ table, row: r }));
      }
      n += rows.length;
      if (rows.length < BATCH) break;
    }
    counts[table] = n;
  }
  return counts;
}

if (typeof require !== 'undefined' && require.main === module) {
  run(async () => {
    const [file] = process.argv.slice(2);
    const url = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!file || !url) {
      console.error('Usage: SOURCE_DATABASE_URL=postgres://… export-supabase <out.ndjson>');
      process.exit(2);
    }
    const { Client } = await import('pg');
    const client = new Client({ connectionString: url, ssl: databaseSslFor(url, process.env.DATABASE_SSL) ? { rejectUnauthorized: false } : undefined });
    await client.connect();
    const out = fs.createWriteStream(file, 'utf8');
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); // one consistent snapshot
      const counts = await exportLegacy((text, params) => client.query(text, params as unknown[]), (line) => out.write(`${line}\n`));
      await client.query('COMMIT');
      for (const [table, n] of Object.entries(counts)) console.log(`${table}: ${n}`);
      console.log(`Wrote ${file}. Next: DATABASE_URL=<new database> node services/api/dist/scripts/import.js ${file}`);
    } finally {
      await new Promise((r) => out.end(r));
      await client.end();
    }
  });
}
