// controllers/tenantController.js
const Tenant = require('../models/Tenant');
const User = require('../models/user');
const { emitToTenant } = require('../utils/realtime');

/**
 * POST /api/tenants
 * Create a new tenant (admin only)
 */
exports.createTenant = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, slug, brandName, logoUrl, primaryColor, secondaryColor } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    // Normalize slug
    const normalizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');

    const tenant = await Tenant.create({
      name,
      slug: normalizedSlug,
      brandName: brandName || name,
      logoUrl: logoUrl || '',
      primaryColor: primaryColor || '#0b1d51',
      secondaryColor: secondaryColor || '#ff6f00'
    });

    res.status(201).json(tenant);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Tenant slug already exists' });
    }
    next(err);
  }
};

/**
 * GET /api/tenants
 * List all tenants (admin only)
 */
exports.getTenants = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const tenants = await Tenant.find().sort({ createdAt: -1 });
    res.json(tenants);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tenant/me
 * Get current user's tenant profile
 */
exports.getMyTenant = async (req, res, next) => {
  try {
    if (!req.user.tenantId) {
      return res.status(404).json({ error: 'No tenant assigned' });
    }

    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tenants/:id/invite
 * Invite a user to a tenant (admin only)
 */
exports.inviteUser = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email, role } = req.body;
    const tenantId = req.params.id;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    if (!['admin', 'dialer', 'closer', 'manager'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.tenantId.toString() === tenantId.toString()) {
        return res.status(400).json({ error: 'User already belongs to this tenant' });
      }
      return res.status(400).json({ error: 'User already exists with different tenant' });
    }

    // Return invitation info (actual user creation would require password setup)
    res.json({
      message: 'Invitation prepared',
      tenant: { id: tenant._id, name: tenant.name },
      email,
      role,
      note: 'User must be created with password via registration or admin setup'
    });
  } catch (err) {
    next(err);
  }
};

