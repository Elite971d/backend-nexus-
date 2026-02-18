// controllers/authControllers.js — Login, logout, me; JWT + httpOnly cookie
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { jwtSecret, jwtExpiresIn, cookie } = require('../config/auth');

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, tenantId: user.tenantId?.toString() || user.tenantId },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function toUserResponse(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId?._id || user.tenantId
  };
}

function toTenantResponse(tenant) {
  if (!tenant) return null;
  return {
    id: tenant._id || tenant,
    name: tenant.name,
    brandName: tenant.brandName,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor
  };
}

/**
 * One-time register: only allowed if there are 0 users.
 */
exports.register = async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return res
        .status(403)
        .json({ error: 'Registration disabled once admin exists.' });
    }

    const { name, email, password } = req.body;
    const passwordHash = await User.hashPassword(password);

    // Create default tenant for first user
    const Tenant = require('../models/Tenant');
    let defaultTenant = await Tenant.findOne({ slug: 'elite-nexus' });
    if (!defaultTenant) {
      defaultTenant = await Tenant.create({
        name: 'Elite Nexus',
        slug: 'elite-nexus',
        brandName: 'Elite Nexus',
        primaryColor: '#0b1d51',
        secondaryColor: '#ff6f00'
      });
    }

    const user = await User.create({ 
      name, 
      email, 
      passwordHash, 
      role: 'admin',
      tenantId: defaultTenant._id 
    });
    const token = signToken(user);

    res.json({
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        tenantId: user.tenantId
      },
      tenant: {
        id: defaultTenant._id,
        name: defaultTenant.name,
        brandName: defaultTenant.brandName,
        logoUrl: defaultTenant.logoUrl,
        primaryColor: defaultTenant.primaryColor,
        secondaryColor: defaultTenant.secondaryColor
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() }).populate('tenantId');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    // Ensure user has tenantId (migration fallback)
    if (!user.tenantId) {
      const Tenant = require('../models/Tenant');
      let defaultTenant = await Tenant.findOne({ slug: 'elite-nexus' });
      if (!defaultTenant) {
        defaultTenant = await Tenant.create({
          name: 'Elite Nexus',
          slug: 'elite-nexus',
          brandName: 'Elite Nexus',
          primaryColor: '#0b1d51',
          secondaryColor: '#ff6f00'
        });
      }
      user.tenantId = defaultTenant._id;
      await user.save();
    }

    const token = signToken(user);
    // Set httpOnly cookie (primary auth for browser)
    res.cookie(cookie.name, token, cookie.options);
    // Also return token for Socket.IO and legacy clients (optional; cookie is authoritative)
    res.json({
      token,
      user: toUserResponse(user),
      tenant: toTenantResponse(user.tenantId)
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {
  const clearOpts = { path: '/', httpOnly: true };
  if (process.env.COOKIE_DOMAIN) clearOpts.domain = process.env.COOKIE_DOMAIN;
  res.clearCookie(cookie.name, clearOpts);
  res.json({ ok: true });
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('tenantId').select('-passwordHash');
    if (!user) return res.status(401).json({ error: 'User not found' });
    const token = signToken(user);
    res.cookie(cookie.name, token, cookie.options);
    res.json({
      user: toUserResponse(user),
      tenant: toTenantResponse(user.tenantId),
      token
    });
  } catch (err) {
    next(err);
  }
};