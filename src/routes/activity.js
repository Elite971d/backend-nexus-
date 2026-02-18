// src/routes/activity.js — GET /api/activity (admin/manager; filter by entityId)
const express = require('express');
const router = express.Router();
const authRequired = require('../../middleware/authMiddleware');
const { injectTenantId } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/rbac');
const dealsService = require('../services/dealsService');
const { success, validationError } = require('../lib/apiResponse');

function zodErrorToDetails(zodError) {
  return zodError.errors.map(e => ({
    path: e.path.join('.'),
    message: e.message
  }));
}

// GET /api/activity — admin/manager only; optional entityId, entityType, pagination
router.get(
  '/',
  authRequired,
  injectTenantId,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const result = await dealsService.listActivity(req.tenantId, req.query);
      if (!result.success) {
        if (result.validation) {
          return validationError(res, 'Invalid query parameters', zodErrorToDetails(result.validation.error));
        }
        return validationError(res, result.error || 'Failed to load activity');
      }
      return success(res, result.data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
