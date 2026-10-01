/**
 * Create a verified portal account without email (the first owner on a fresh install).
 *
 *   DATABASE_URL=... node services/api/dist/scripts/create-user.js owner@example.com 'A-strong-passw0rd'
 *
 * Then sign in at /portal. To give the account an existing app, use claim-tenant.
 */
import { createVerifiedUser } from '../auth/accounts';
import { DEFAULT_SCRYPT_COST } from '../auth/passwords';
import { testConfig } from '../config';
import { openDatabase, run } from './util';

run(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: create-user <email> <password>');
    process.exit(2);
  }
  const db = await openDatabase();
  try {
    const config = { ...testConfig(), passwordCost: DEFAULT_SCRYPT_COST };
    const user = await createVerifiedUser({ db, config, now: () => new Date() }, email, password);
    console.log(`Created ${user.email} (${user.id}). Sign in at /portal.`);
  } finally {
    await db.destroy();
  }
});
