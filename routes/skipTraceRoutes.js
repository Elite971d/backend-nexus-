// routes/skipTraceRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const skipTraceController = require('../controllers/skipTraceController');

// All skip trace routes require auth
router.use(authRequired);

// POST /api/skiptrace/:leadId - Request skip trace (admin, manager, closer)
// Also supports /api/skiptrace/leads/:id for backward compatibility
router.post('/:leadId', requireRole('admin', 'manager', 'closer'), skipTraceController.requestSkipTrace);
router.post('/leads/:id', requireRole('admin', 'manager', 'closer'), skipTraceController.requestSkipTrace);

// GET /api/skiptrace/leads/:id - Get skip trace data (all roles, filtered by role)
router.get('/leads/:id', requireRole('admin', 'manager', 'closer', 'dialer'), skipTraceController.getSkipTrace);

// POST /api/skiptrace/leads/:id/lock - Lock/unlock skip trace (admin only)
router.post('/leads/:id/lock', requireRole('admin'), skipTraceController.lockSkipTrace);

// GET /api/skiptrace/leads/:id/estimate - Estimate cost
router.get('/leads/:id/estimate', requireRole('admin', 'manager', 'closer'), skipTraceController.estimateCost);

module.exports = router;

