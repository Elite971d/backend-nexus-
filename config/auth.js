// config/auth.js — JWT, magic-link, and httpOnly cookie configuration

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'nexus_token';
const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  magicLinkSecret: process.env.MAGIC_LINK_SECRET || 'dev_magic_link_secret_change_me',

  // httpOnly cookie — same-origin (strict) and HTTPS-only in production
  cookie: {
    name: COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: isProd || process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAME_SITE || (isProd ? 'strict' : 'lax')),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/',
      ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN })
    }
  }
};
