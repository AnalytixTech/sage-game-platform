/**
 * Apply pending database migrations (safe to run on every deploy; concurrent runs wait on a lock).
 *
 *   DATABASE_URL=... node services/api/dist/scripts/migrate.js
 */
import { dialectOf } from '../db/db';
import { migrateToLatest } from '../db/migrate';
import { openDatabase, run } from './util';

run(async () => {
  const db = await openDatabase();
  try {
    const applied = await migrateToLatest(db);
    console.log(applied.length ? `Applied ${applied.join(', ')} (${dialectOf(db)}).` : `Database is up to date (${dialectOf(db)}).`);
  } finally {
    await db.destroy();
  }
});
