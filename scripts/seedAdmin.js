// scripts/seedAdmin.js
// Nexus: one-time admin user seeding with default tenant
// Safe to run on every deploy — only creates admin if no users exist

const User = require('../models/user');
const Tenant = require('../models/Tenant');

const DEFAULT_TENANT_SLUG = 'default';
const DEFAULT_TENANT_NAME = 'Default Tenant';

/**
 * Ensures a default tenant exists; returns its _id.
 * @returns {Promise<mongoose.Types.ObjectId>}
 */
async function ensureDefaultTenant() {
  let tenant = await Tenant.findOne({ slug: DEFAULT_TENANT_SLUG });
  if (!tenant) {
    tenant = await Tenant.create({
      name: DEFAULT_TENANT_NAME,
      slug: DEFAULT_TENANT_SLUG
    });
    console.log('✅ Default tenant created');
  }
  return tenant._id;
}

/**
 * Seeds an admin user if no users exist in the database.
 * Creates a default tenant when needed (User.tenantId is required).
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD environment variables.
 *
 * Behavior:
 * - If NO users exist: Creates default tenant (if needed), then admin with role "admin"
 * - If users already exist: Skips seeding (safe to run multiple times)
 *
 * @returns {Promise<void>}
 */
async function seedAdmin() {
  try {
    const userCount = await User.countDocuments();

    if (userCount > 0) {
      console.log('ℹ️  Admin already exists — skipping seed');
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;

    if (!adminEmail) {
      console.warn('⚠️  ADMIN_EMAIL not set — skipping admin seed');
      console.warn('   Set in Fly.io: fly secrets set ADMIN_EMAIL="..."');
      return;
    }

    const tenantId = await ensureDefaultTenant();

    const adminUser = await User.create({
      tenantId,
      email: adminEmail.toLowerCase(),
      role: 'admin',
      name: 'Admin User'
    });

    console.log('✅ Admin user created');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Role: ${adminUser.role}`);
  } catch (err) {
    console.error('❌ Error seeding admin user:', err.message);

    if (err.code === 11000) {
      console.log('ℹ️  Admin user already exists (duplicate email) — skipping seed');
      return;
    }

    console.error('   Admin seeding failed, but server will continue to start');
  }
}

module.exports = seedAdmin;
