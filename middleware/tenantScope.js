// middleware/tenantScope.js
// Middleware to inject tenantId into queries and reject cross-tenant access

/**
 * Middleware to inject tenantId into request for use in controllers
 * Requires authRequired to run first
 */
function injectTenantId(req, res, next) {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  req.tenantId = req.user.tenantId;
  next();
}

/**
 * Helper to add tenantId to query filters
 */
function addTenantFilter(filter, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }
  return { ...filter, tenantId };
}

/**
 * Helper to verify tenant ownership of a document
 */
async function verifyTenantOwnership(Model, documentId, tenantId) {
  const doc = await Model.findById(documentId);
  if (!doc) {
    return { valid: false, error: 'Document not found' };
  }
  if (doc.tenantId && doc.tenantId.toString() !== tenantId.toString()) {
    return { valid: false, error: 'Cross-tenant access denied' };
  }
  return { valid: true, document: doc };
}

module.exports = {
  injectTenantId,
  addTenantFilter,
  verifyTenantOwnership
};

