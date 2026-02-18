// middleware/authMiddleware.js — Re-exports authRequired from middleware/auth.js
// so existing routes get JWT from httpOnly cookie or Authorization Bearer.
const { authRequired } = require('./auth');
module.exports = authRequired;
