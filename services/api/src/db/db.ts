import { Pool, PoolClient } from 'pg';

/** Tables the running code needs; if any is missing, a migration hasn't been applied. */
export const REQUIRED_TABLES = ['games', 'game_sessions', 'quiz_banks', 'webhook_deliveries', 'matches', 'match_players'];

/** Anything that can run a parameterised query and return its rows. */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
}

export interface Db extends Queryable {
  /** Run fn inside a transaction; commits on success and rolls back on error. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createPgDb(connectionString: string, ssl: boolean): Db {
  const pool = new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  // Platform tables live in their own schema (see supabase/migrations). This needs a session-mode
  // connection (Supabase session pooler on port 5432 or a direct connection), not the transaction
  // pooler on 6543, because the setting must persist for the life of the connection.
  // Each new connection is set up before its first query (awaited, so the two never overlap).
  const ready = new WeakSet<PoolClient>();
  const acquire = async (): Promise<PoolClient> => {
    const client = await pool.connect();
    if (!ready.has(client)) {
      try {
        await client.query('SET search_path TO sagegames, public');
        ready.add(client);
      } catch (err) {
        client.release(err as Error); // discard the connection
        throw err;
      }
    }
    return client;
  };

  const wrap = (client: PoolClient): Queryable => ({
    query: async <R>(text: string, params?: unknown[]) => (await client.query(text, params)).rows as R[],
  });

  return {
    async query<R>(text: string, params?: unknown[]) {
      const client = await acquire();
      try {
        return (await client.query(text, params)).rows as R[];
      } finally {
        client.release();
      }
    },
    async tx(fn) {
      const client = await acquire();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function one<R>(q: Queryable, text: string, params?: unknown[]): Promise<R | null> {
  const rows = await q.query<R>(text, params);
  return rows[0] ?? null;
}
