/**
 * Make a portal account the owner of an existing app (e.g. one created from SAGE_TENANT_KEYS), so
 * they can issue portal keys for it and retire the bootstrap key.
 *
 *   DATABASE_URL=... node services/api/dist/scripts/claim-tenant.js tenant_campus_app owner@example.com
 *
 * The account must exist first (sign up at /portal, or create it with create-user).
 */
import { normalizeEmail } from '../auth/accounts';
import { onConflictUpdate } from '../db/db';
import { openDatabase, run } from './util';

run(async () => {
  const [tenantId, email] = process.argv.slice(2);
  if (!tenantId || !email) {
    console.error('Usage: claim-tenant <tenantId> <email>');
    process.exit(2);
  }
  const db = await openDatabase();
  try {
    const tenant = await db.selectFrom('sagegames_tenants').select(['id', 'name']).where('id', '=', tenantId).executeTakeFirst();
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    const user = await db.selectFrom('sagegames_users').select('id').where('email', '=', normalizeEmail(email)).executeTakeFirst();
    if (!user) throw new Error(`No portal account for ${email}. Sign up at /portal (or run create-user) first.`);
    await onConflictUpdate(
      db,
      db.insertInto('sagegames_tenant_members').values({ tenant_id: tenantId, user_id: user.id, role: 'owner', created_at: new Date() }),
      ['tenant_id', 'user_id'],
      { role: 'owner' }
    ).execute();
    console.log(`${email} now owns ${tenant.name} (${tenantId}).`);
  } finally {
    await db.destroy();
  }
});
