// controllers/authControllers.js — Magic-link auth; JWT + httpOnly cookie (no passwords)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const LoginToken = require('../models/LoginToken');
const { jwtSecret, jwtExpiresIn, cookie, magicLinkSecret } = require('../config/auth');
const { sendMagicLinkEmail } = require('../services/magicLinkEmailService');

const MAGIC_LINK_EXPIRES_MINUTES = 15;

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, tenantId: user.tenantId?.toString() || user.tenantId },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function hashToken(token) {
  return crypto.createHmac('sha256', magicLinkSecret).update(token).digest('hex');
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
 * POST /api/auth/request-link
 * Body: { email }
 * Same response whether email exists or not (no user enumeration).
 * If user exists: create single-use token (hashed), store, send login link via SMTP.
 */
exports.requestLink = async (req, res, next) => {
  try {
    const email = (req.body.email || '').toString().trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email }).select('_id');
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRES_MINUTES * 60 * 1000);
      await LoginToken.create({ tokenHash, userId: user._id, expiresAt });

      const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
      const loginLink = `${baseUrl.replace(/\/$/, '')}/?token=${rawToken}`;
      const deviceInfo = req.get('user-agent') || 'Unknown';
      const ip = req.ip || req.connection?.remoteAddress || '';

      try {
        await sendMagicLinkEmail({
          to: email,
          loginLink,
          deviceInfo,
          ip,
          expiresMinutes: MAGIC_LINK_EXPIRES_MINUTES
        });
      } catch (err) {
        // Log but do not leak; return same success message
        req.log?.warn?.({ err: err.message }, 'Magic link email send failed');
      }
    }

    res.status(200).json({
      message: 'If an account exists for this email, you will receive a login link shortly. Check your inbox and spam folder.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/verify?token=...
 * Validate single-use token, set httpOnly secure JWT cookie, invalidate token.
 */
exports.verify = async (req, res, next) => {
  try {
    const rawToken = (req.query.token || '').toString().trim();
    if (!rawToken) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const tokenHash = hashToken(rawToken);
    const record = await LoginToken.findOne({ tokenHash }).exec();
    if (!record) {
      return res.status(401).json({ error: 'Invalid or expired link' });
    }
    if (record.usedAt) {
      return res.status(401).json({ error: 'This link has already been used' });
    }
    if (new Date() > record.expiresAt) {
      return res.status(401).json({ error: 'This link has expired' });
    }

    record.usedAt = new Date();
    await record.save();

    const user = await User.findById(record.userId).populate('tenantId').select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

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
    res.cookie(cookie.name, token, cookie.options);
    res.json({
      token,
      user: toUserResponse(user),
      tenant: toTenantResponse(user.tenantId)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * One-time register: only allowed if there are 0 users. No password (passwordless).
 */
exports.register = async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return res
        .status(403)
        .json({ error: 'Registration disabled once admin exists.' });
    }

    const { name, email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

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
      name: name || '',
      email: email.trim().toLowerCase(),
      role: 'admin',
      tenantId: defaultTenant._id
    });
    const token = signToken(user);

    res.json({
      token,
      user: toUserResponse(user),
      tenant: toTenantResponse(defaultTenant)
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {
  const clearOpts = { path: '/', httpOnly: true, secure: cookie.options.secure, sameSite: cookie.options.sameSite };
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
