// middleware/rbac.js — Role-based access control (admin, manager, intake, analyst, viewer)

const ROLES = ['admin', 'manager', 'intake', 'analyst', 'viewer'];

// Permissions per role (admin implied full access)
// Format: resource:action or resource:action:scope
const ROLE_PERMISSIONS = {
  admin: ['*'],
  manager: [
    'deals:create', 'deals:read', 'deals:update', 'deals:delete', 'deals:assign',
    'leads:create', 'leads:read', 'leads:update', 'leads:delete',
    'activity:read', 'users:read'
  ],
  intake: [
    'deals:create', 'deals:read', 'deals:update:own',  // cannot delete, cannot assign others
    'leads:create', 'leads:read', 'leads:update:own'
  ],
  analyst: [
    'deals:read', 'deals:update', 'deals:notes',  // no delete, no user management
    'leads:read', 'leads:update'
  ],
  viewer: [
    'deals:read', 'leads:read', 'activity:read'
  ]
};

// Legacy roles (dialer, closer) — map to equivalent permissions for backward compatibility
ROLE_PERMISSIONS.dialer = ['deals:read', 'deals:update', 'leads:read', 'leads:update'];
ROLE_PERMISSIONS.closer = ['deals:read', 'deals:update', 'deals:notes', 'leads:read', 'leads:update'];

function hasPermission(role, permission) {
  if (!role || !ROLES.includes(role) && !['dialer', 'closer'].includes(role)) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  // Exact match
  if (perms.includes(permission)) return true;
  // Wildcard: e.g. "deals:*" grants "deals:update"
  const [resource, action] = permission.split(':');
  if (perms.includes(`${resource}:*`)) return true;
  return false;
}

/**
 * Require one of the given roles (no permission granularity).
 * Use after authRequired. Admin always allowed.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const role = req.user.role;
    if (role === 'admin') return next();
    // Manager can access dialer/closer/manager routes for backward compatibility
    if (role === 'manager' && allowedRoles.some(r => ['manager', 'dialer', 'closer'].includes(r))) return next();
    if (allowedRoles.includes(role)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/**
 * Require a specific permission (e.g. 'deals:update', 'deals:update:own').
 * Use after authRequired. For :own, resource ownership is checked in the route/controller.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const role = req.user.role;
    if (hasPermission(role, permission) || hasPermission(role, '*')) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/**
 * Require role to be one of the RBAC set (admin, manager, intake, analyst, viewer).
 * Legacy dialer/closer still pass; use for routes that need at least “staff” access.
 */
function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const staffRoles = ['admin', 'manager', 'intake', 'analyst', 'viewer', 'dialer', 'closer'];
  if (staffRoles.includes(req.user.role)) return next();
  return res.status(403).json({ error: 'Insufficient permissions' });
}

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  requireRole,
  requirePermission,
  requireStaff
};
