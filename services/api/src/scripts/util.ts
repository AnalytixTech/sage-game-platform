import { databaseSslFor } from '../config';
import { createDb, Db } from '../db/db';

/** Open the database named by DATABASE_URL (and DATABASE_SSL), for command-line scripts. */
export async function openDatabase(url = process.env.DATABASE_URL): Promise<Db> {
  if (!url) throw new Error('DATABASE_URL is required');
  return createDb(url, { ssl: databaseSslFor(url, process.env.DATABASE_SSL), poolSize: 2 });
}

/** Run a script's main function and exit with a readable error. */
export function run(main: () => Promise<void>) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
