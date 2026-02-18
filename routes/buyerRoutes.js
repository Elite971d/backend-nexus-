// routes/buyerRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const buyerController = require('../controllers/buyerController');

// All buyer routes require auth
router.use(authRequired);

// GET /api/buyers - List buyers with filtering
router.get('/', requireRole('admin', 'manager', 'closer'), buyerController.getBuyers);

// GET /api/buyers/export - Export buyers CSV
router.get('/export', requireRole('admin', 'manager', 'closer'), buyerController.exportBuyers);

// GET /api/buyers/:id - Get single buyer
router.get('/:id', requireRole('admin', 'manager', 'closer'), buyerController.getBuyer);

// POST /api/buyers - Create buyer manually
router.post('/', requireRole('admin', 'manager'), buyerController.createBuyer);

// PUT /api/buyers/:id - Update buyer
router.put('/:id', requireRole('admin', 'manager'), buyerController.updateBuyer);

// DELETE /api/buyers/:id - Soft delete buyer (set active=false)
router.delete('/:id', requireRole('admin', 'manager'), buyerController.deleteBuyer);

// POST /api/buyers/leads/:leadId/attach - Attach buyer to lead
router.post('/leads/:leadId/attach', requireRole('admin', 'manager', 'closer'), buyerController.attachBuyerToLead);

// GET /api/buyers/match/:leadId - Match buyers for a lead
router.get('/match/:leadId', requireRole('admin', 'manager', 'closer'), buyerController.matchBuyersForLead);

module.exports = router;

