// middleware/auth.js — JWT verification from httpOnly cookie or Authorization Bearer

const jwt = require('jsonwebtoken');
const { jwtSecret, cookie } = require('../config/auth');

const COOKIE_NAME = cookie.name;

/**
 * Resolve JWT from request: cookie (preferred) or Authorization Bearer.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function getTokenFromRequest(req) {
  // 1. Cookie (httpOnly) — preferred for browser
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) return cookieToken;

  // 2. Authorization header (for API clients / Socket handshake)
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  return null;
}

/**
 * Authenticate request: verify JWT from cookie or Bearer, set req.user.
 * Responds 401 if missing or invalid token.
 */
function authRequired(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: 'Auth token missing' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId || null
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth: set req.user if valid token present, otherwise continue without user.
 */
function authOptional(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId || null
    };
  } catch (_) {
    // ignore invalid/expired
  }
  next();
}

module.exports = {
  authRequired,
  authOptional,
  getTokenFromRequest
};
