/**
 * Database access for any supported SQL database, chosen by the DATABASE_URL scheme:
 *
 *   postgres://… or postgresql://…   Postgres (any provider, including transaction poolers)
 *   mysql://…                        MySQL 8 / MariaDB 10.6+
 *   sqlite:./data/sagegames.db       SQLite (built into Node, no native module); also file:…
 *   pglite://memory                  In-memory Postgres (development and tests)
 *
 * Queries are written once with Kysely; the few dialect differences live in the helpers below.
 */
import fs from 'fs';
import path from 'path';
import {
  Expression,
  Kysely,
  KyselyPlugin,
  MysqlAdapter,
  MysqlDialect,
  PGliteDialect,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  PostgresAdapter,
  PostgresDialect,
  QueryResult,
  RawBuilder,
  RootOperationNode,
  sql,
  SqliteDialect,
  UnknownRow,
} from 'kysely';
import { Database } from './types';

export type Db = Kysely<Database>;
export type DialectName = 'postgres' | 'mysql' | 'sqlite';

export function dialectForUrl(url: string): DialectName {
  if (/^postgres(ql)?:\/\//i.test(url) || /^pglite:/i.test(url)) return 'postgres';
  if (/^(mysql|mariadb):\/\//i.test(url)) return 'mysql';
  if (/^(sqlite|file):/i.test(url)) return 'sqlite';
  throw new Error(`Unsupported DATABASE_URL scheme (expected postgres://, mysql://, sqlite: or file:): ${url.split(':')[0]}:`);
}

/** The dialect a Kysely instance (or transaction) talks to. */
export function dialectOf(q: Kysely<Database>): DialectName {
  const adapter = q.getExecutor().adapter;
  if (adapter instanceof PostgresAdapter) return 'postgres';
  if (adapter instanceof MysqlAdapter) return 'mysql';
  return 'sqlite';
}

export interface DbOptions {
  /** TLS for Postgres and MySQL (certificates are not verified, as with most managed poolers). */
  ssl?: boolean;
  /** Pool size for Postgres and MySQL. */
  poolSize?: number;
}

export async function createDb(url: string, options: DbOptions = {}): Promise<Db> {
  const name = dialectForUrl(url);
  const plugins = [new NormalizePlugin(name)];

  if (/^pglite:/i.test(url)) {
    const pglite = await createPglite();
    return new Kysely<Database>({ dialect: new PGliteDialect({ pglite }), plugins });
  }

  if (name === 'postgres') {
    const { Pool, types } = await import('pg');
    // COUNT/SUM and BIGINT columns come back as numbers, like the other dialects.
    const parsers = {
      getTypeParser: ((oid: number, format?: string) =>
        oid === 20 || oid === 1700 ? (v: string) => Number(v) : types.getTypeParser(oid, format as 'text')) as typeof types.getTypeParser,
    };
    const pool = new Pool({
      connectionString: url,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
      max: options.poolSize ?? 10,
      types: parsers,
    });
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }), plugins });
  }

  if (name === 'mysql') {
    const { createPool } = await import('mysql2');
    const pool = createPool({
      uri: url.replace(/^mariadb:/i, 'mysql:'),
      // Timestamps are UTC on the wire and in DATETIME columns.
      timezone: 'Z',
      dateStrings: false,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      charset: 'utf8mb4',
      connectionLimit: options.poolSize ?? 10,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    });
    return new Kysely<Database>({ dialect: new MysqlDialect({ pool }), plugins });
  }

  const file = sqlitePath(url);
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: () => openSqlite(file) }), plugins });
}

/** In-memory Postgres (WASM) for development and tests. BIGINT/NUMERIC parsed as numbers. */
export async function createPglite() {
  const mod = '@electric-sql/pglite';
  const { PGlite } = (await import(mod)) as { PGlite: { create(o: unknown): Promise<unknown> } };
  const pg = await PGlite.create({ parsers: { 20: Number, 1700: Number } });
  return pg as ConstructorParameters<typeof PGliteDialect>[0]['pglite'];
}

// ---------------------------------------------------------------- SQLite (node:sqlite)

export function sqlitePath(url: string): string {
  const rest = url.replace(/^(sqlite|file):(\/\/)?/i, '');
  if (rest === '' || rest === ':memory:' || rest === 'memory') return ':memory:';
  return rest;
}

interface NodeSqliteStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(...params: unknown[]): IterableIterator<unknown>;
  columns?(): unknown[];
}
interface NodeSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeSqliteStatement;
  close(): void;
}

/** SQLite has no Date or boolean type: store timestamps as ISO-8601 UTC text and booleans as 0/1. */
function sqliteParam(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

const READS = /^\s*(select|with|pragma|values|explain)\b|\breturning\b/i;

async function openSqlite(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const mod = 'node:sqlite';
  const { DatabaseSync } = (await import(mod)) as { DatabaseSync: new (file: string) => NodeSqliteDatabase };
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  return {
    close: () => db.close(),
    prepare(text: string) {
      const stmt = db.prepare(text);
      const reader = stmt.columns ? stmt.columns().length > 0 : READS.test(text);
      const args = (params: ReadonlyArray<unknown>) => params.map(sqliteParam);
      return {
        reader,
        all: (params: ReadonlyArray<unknown>) => stmt.all(...args(params)),
        run: (params: ReadonlyArray<unknown>) => stmt.run(...args(params)),
        iterate: (params: ReadonlyArray<unknown>) => stmt.iterate(...args(params)),
      };
    },
  };
}

// ---------------------------------------------------------------- One shape on every dialect

/** Columns stored as JSON (jsonb on Postgres, text elsewhere). */
const JSON_COLUMNS = new Set([
  'supported_platforms',
  'allowed_configurations',
  'resolved_config',
  'metadata',
  'log',
  'result',
  'flags',
  'questions',
  'payload',
  'standings',
]);
const BOOLEAN_COLUMNS = new Set(['is_test', 'is_valid', 'is_enabled', 'allow_join']);

/**
 * Reads come back the same everywhere: `*_at` columns as Date (SQLite stores ISO text), booleans
 * as true/false (MySQL and SQLite use 0/1) and JSON columns parsed (text outside Postgres).
 */
class NormalizePlugin implements KyselyPlugin {
  constructor(private readonly dialect: DialectName) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    const rows = args.result.rows;
    if (!rows.length) return args.result;
    return { ...args.result, rows: rows.map((row) => this.row(row)) };
  }

  private row(row: UnknownRow): UnknownRow {
    const out: UnknownRow = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = this.value(key, value);
    }
    return out;
  }

  private value(key: string, value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (key.endsWith('_at') && typeof value === 'string') return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
    if (BOOLEAN_COLUMNS.has(key) && typeof value === 'number') return value !== 0;
    if (JSON_COLUMNS.has(key) && this.dialect !== 'postgres' && typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
}

// ---------------------------------------------------------------- Portable SQL helpers

/** Serialise a value for a JSON column (the only way JSON is written). */
export const json = (value: unknown): string => JSON.stringify(value ?? null);

/** Lock the selected rows for the rest of the transaction (SQLite is single-writer: no-op). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function forUpdate<QB extends { forUpdate(): QB }>(q: Db, qb: QB): QB {
  return dialectOf(q) === 'sqlite' ? qb : qb.forUpdate();
}

/** The value an upsert tried to insert, for use in its update clause. */
export function excluded(q: Db, column: string): RawBuilder<unknown> {
  return dialectOf(q) === 'mysql' ? sql`values(${sql.ref(column)})` : sql.ref(`excluded.${column}`);
}

/**
 * INSERT … or update on conflict with the given key columns (ON CONFLICT on Postgres and SQLite,
 * ON DUPLICATE KEY UPDATE on MySQL, where the key is the table's primary/unique key).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onConflictUpdate<IB extends { onConflict: any; onDuplicateKeyUpdate: any }>(
  q: Db,
  ib: IB,
  keyColumns: string[],
  set: Record<string, unknown>
): IB {
  return dialectOf(q) === 'mysql'
    ? ib.onDuplicateKeyUpdate(set)
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ib.onConflict((oc: any) => oc.columns(keyColumns).doUpdateSet(set));
}

/** INSERT … unless a row with the same key exists. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onConflictIgnore<IB extends { onConflict: any; ignore: any }>(q: Db, ib: IB, keyColumns: string[]): IB {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dialectOf(q) === 'mysql' ? ib.ignore() : ib.onConflict((oc: any) => oc.columns(keyColumns).doNothing());
}

/** The larger of two values (GREATEST, or SQLite's two-argument MAX). */
export function greatest(q: Db, a: Expression<unknown>, b: Expression<unknown>): RawBuilder<number> {
  return dialectOf(q) === 'sqlite' ? sql<number>`max(${a}, ${b})` : sql<number>`greatest(${a}, ${b})`;
}

/** YYYY-MM-DD (UTC) of a timestamp column. */
export function utcDay(q: Db, column: string): RawBuilder<string> {
  const ref = sql.ref(column);
  switch (dialectOf(q)) {
    case 'postgres':
      return sql<string>`to_char(${ref} at time zone 'UTC', 'YYYY-MM-DD')`;
    case 'mysql':
      return sql<string>`date_format(${ref}, '%Y-%m-%d')`;
    default:
      return sql<string>`substr(${ref}, 1, 10)`;
  }
}

/** True for errors the database raises to break a deadlock (the transaction can simply be retried). */
export function isDeadlock(err: unknown): boolean {
  const e = err as { code?: string; errno?: number } | null;
  return e?.code === 'ER_LOCK_DEADLOCK' || e?.errno === 1213 || e?.code === '40P01' || e?.code === '40001';
}

/** Run fn, retrying a few times (with a short jittered pause) when the database picks it as a deadlock victim. */
export async function retryOnDeadlock<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDeadlock(err) || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 10 * i + Math.random() * 20));
    }
  }
}

/** Rows changed by an UPDATE/DELETE result. */
export const changed = (result: { numUpdatedRows?: bigint; numDeletedRows?: bigint }): number =>
  Number(result.numUpdatedRows ?? result.numDeletedRows ?? 0);
