/**
 * Rate limiting: global + stricter on auth endpoints.
 * Prevents abuse and brute-force attacks.
 */
const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 min
const max = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const authWindowMs = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 min
const authMax = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10);

/** Global rate limit for all /api requests */
const globalLimiter = rateLimit({
  windowMs,
  max,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Stricter rate limit for auth endpoints (login, register, etc.) */
const authLimiter = rateLimit({
  windowMs: authWindowMs,
  max: authMax,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { globalLimiter, authLimiter };
