// src/routes/deals.js — REST API for deals: list, create, get, patch, assign; notes mounted at /:id/notes
const express = require('express');
const router = express.Router({ mergeParams: true });
const authRequired = require('../../middleware/authMiddleware');
const { injectTenantId } = require('../../middleware/tenantScope');
const { requirePermission, requireRole } = require('../../middleware/rbac');
const dealsService = require('../services/dealsService');
const { success, created, notFound, validationError } = require('../lib/apiResponse');

function zodErrorToDetails(zodError) {
  return zodError.errors.map(e => ({
    path: e.path.join('.'),
    message: e.message
  }));
}

// All deal routes: auth + tenant
router.use(authRequired);
router.use(injectTenantId);

// GET /api/deals — filter by status, assignedTo, search; pagination
router.get('/', requirePermission('deals:read'), async (req, res, next) => {
  try {
    const result = await dealsService.listDeals(req.tenantId, req.query);
    if (!result.success) {
      return validationError(res, 'Invalid query parameters', zodErrorToDetails(result.validation.error));
    }
    return success(res, result.data);
  } catch (err) {
    next(err);
  }
});

// POST /api/deals — create new deal
router.post('/', requirePermission('deals:create'), async (req, res, next) => {
  try {
    const result = await dealsService.createDeal(req.tenantId, req.user.id, req.body);
    if (!result.success) {
      if (result.validation) {
        return validationError(res, 'Validation failed', zodErrorToDetails(result.validation.error));
      }
      return validationError(res, result.error || 'Create failed');
    }
    return created(res, result.data);
  } catch (err) {
    next(err);
  }
});

// GET /api/deals/:id
router.get('/:id', requirePermission('deals:read'), async (req, res, next) => {
  try {
    const result = await dealsService.getDealById(req.tenantId, req.params.id);
    if (!result.success) {
      if (result.notFound) return notFound(res, 'Deal');
      return validationError(res, result.error);
    }
    return success(res, result.data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/deals/:id — update allowed fields only (whitelist in service)
router.patch('/:id', requirePermission('deals:update'), async (req, res, next) => {
  try {
    const result = await dealsService.updateDeal(req.tenantId, req.user.id, req.params.id, req.body);
    if (!result.success) {
      if (result.notFound) return notFound(res, 'Deal');
      if (result.validation) {
        return validationError(res, 'Validation failed', zodErrorToDetails(result.validation.error));
      }
      return validationError(res, result.error || 'Update failed');
    }
    return success(res, result.data);
  } catch (err) {
    next(err);
  }
});

// POST /api/deals/:id/assign — admin/manager only
router.post('/:id/assign', requirePermission('deals:assign'), async (req, res, next) => {
  try {
    const result = await dealsService.assignDeal(req.tenantId, req.user.id, req.params.id, req.body);
    if (!result.success) {
      if (result.notFound) return notFound(res, 'Deal');
      if (result.validation) {
        return validationError(res, 'Validation failed', zodErrorToDetails(result.validation.error));
      }
      return validationError(res, result.error || 'Assign failed');
    }
    return success(res, result.data);
  } catch (err) {
    next(err);
  }
});

// Notes sub-routes: POST /api/deals/:id/notes, GET /api/deals/:id/notes
const notesRouter = require('./notes');
router.use('/:id/notes', notesRouter);

module.exports = router;
