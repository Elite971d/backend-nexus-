// src/routes/notes.js — Deal notes: POST (add), GET (list). Mounted at /api/deals/:id/notes
const express = require('express');
const router = express.Router({ mergeParams: true });
const { requirePermission } = require('../../middleware/rbac');
const dealsService = require('../services/dealsService');
const { success, created, notFound, validationError } = require('../lib/apiResponse');

// Parent deals router already applies authRequired + injectTenantId; :id is in req.params
function zodErrorToDetails(zodError) {
  return zodError.errors.map(e => ({
    path: e.path.join('.'),
    message: e.message
  }));
}

// GET /api/deals/:id/notes
router.get('/', requirePermission('deals:read'), async (req, res, next) => {
  try {
    const dealId = req.params.id;
    const result = await dealsService.getNotes(req.tenantId, dealId);
    if (!result.success) {
      if (result.notFound) return notFound(res, 'Deal');
      return validationError(res, result.error || 'Failed to load notes');
    }
    return success(res, { notes: result.data });
  } catch (err) {
    next(err);
  }
});

// POST /api/deals/:id/notes
router.post('/', requirePermission('deals:update'), async (req, res, next) => {
  try {
    const dealId = req.params.id;
    const result = await dealsService.addNote(req.tenantId, req.user.id, dealId, req.body);
    if (!result.success) {
      if (result.notFound) return notFound(res, 'Deal');
      if (result.validation) {
        return validationError(res, 'Validation failed', zodErrorToDetails(result.validation.error));
      }
      return validationError(res, result.error || 'Failed to add note');
    }
    return created(res, result.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
