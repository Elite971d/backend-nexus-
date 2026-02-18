// middleware/roleMiddleware.js — Re-exports RBAC from middleware/rbac.js
// Supports roles: admin, manager, intake, analyst, viewer, dialer, closer
const { requireRole } = require('./rbac');
module.exports = requireRole;
