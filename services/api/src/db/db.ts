import { Pool, PoolClient } from 'pg';

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
  pool.on('connect', (client) => {
    client.query('SET search_path TO sagegames, public').catch(() => undefined);
  });

  const wrap = (client: Pool | PoolClient): Queryable => ({
    query: async <R>(text: string, params?: unknown[]) => (await client.query(text, params)).rows as R[],
  });

  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
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
