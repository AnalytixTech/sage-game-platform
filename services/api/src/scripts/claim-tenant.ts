/**
 * Make a portal user the owner of an existing tenant (e.g. one created from SAGE_TENANT_KEYS), so
 * they can issue portal keys for it and retire the bootstrap key.
 *
 *   DATABASE_URL=... node services/api/dist/scripts/claim-tenant.js tenant_campus_app owner@example.com
 *
 * The user must have signed up in the portal (and confirmed their email) first.
 */
import { createPgDb, one } from '../db/db';

async function main() {
  const [tenantId, email] = process.argv.slice(2);
  if (!tenantId || !email) {
    console.error('Usage: claim-tenant <tenantId> <email>');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const db = createPgDb(url, !/@(localhost|127\.0\.0\.1)[:/]/.test(url));
  try {
    const tenant = await one<{ id: string; name: string }>(db, 'SELECT id, name FROM tenants WHERE id = $1', [tenantId]);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    const user = await one<{ id: string }>(db, 'SELECT id FROM auth.users WHERE lower(email) = lower($1)', [email]);
    if (!user) throw new Error(`No portal account for ${email}. Sign up at /portal first.`);
    await db.query(
      `INSERT INTO tenant_members (tenant_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner'`,
      [tenantId, user.id]
    );
    console.log(`${email} now owns ${tenant.name} (${tenantId}).`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
