// config/auth.js — JWT and httpOnly cookie configuration

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'nexus_token';

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // httpOnly cookie (production: set COOKIE_DOMAIN, COOKIE_SECURE=true)
  cookie: {
    name: COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: process.env.COOKIE_SAME_SITE || 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/',
      ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN })
    }
  }
};
