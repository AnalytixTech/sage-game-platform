/**
 * Schema migrations for every dialect, applied under a lock (an advisory lock on Postgres,
 * GET_LOCK on MySQL, SQLite's single connection) so two processes never migrate at once.
 *
 *   npm run db:migrate                         (or node services/api/dist/scripts/migrate.js)
 *   node services/api/dist/server.js --migrate (apply pending migrations, then start)
 */
import { Kysely } from 'kysely';
// Kysely's migrator lives at a subpath (mapped for the type checker in tsconfig.json).
import { Migration, MigrationResultSet, Migrator } from 'kysely/migration';
import { Db } from './db';
import * as m0001 from './migrations/0001_init';

/** In order. Never edit a released migration: add a new one. */
const MIGRATIONS: Record<string, Migration> = {
  '0001_init': m0001,
};

export const MIGRATION_TABLE = 'sagegames_migrations';

function migrator(db: Db): Migrator {
  return new Migrator({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: db as Kysely<any>,
    provider: { getMigrations: async () => MIGRATIONS },
    migrationTableName: MIGRATION_TABLE,
    migrationLockTableName: 'sagegames_migration_lock',
  });
}

/** Apply pending migrations. Returns the names applied; throws if one fails. */
export async function migrateToLatest(db: Db): Promise<string[]> {
  const { error, results }: MigrationResultSet = await migrator(db).migrateToLatest();
  if (error) {
    const failed = results?.find((r) => r.status === 'Error')?.migrationName;
    throw new Error(`Migration ${failed ?? ''} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}

/** Migrations not yet applied to this database. */
export async function pendingMigrations(db: Db): Promise<string[]> {
  const all = await migrator(db).getMigrations();
  return all.filter((m) => !m.executedAt).map((m) => m.name);
}
