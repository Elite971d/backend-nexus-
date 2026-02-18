// routes/buyBoxRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const buyBoxController = require('../controllers/buyBoxController');

// All buy box routes require auth
router.use(authRequired);

// GET /api/buyboxes - List buy boxes with optional filtering
router.get('/', requireRole('admin', 'manager', 'closer'), buyBoxController.getBuyBoxes);

// GET /api/buyboxes/:id - Get single buy box
router.get('/:id', requireRole('admin', 'manager', 'closer'), buyBoxController.getBuyBox);

// POST /api/buyboxes - Create buy box (admin/manager only)
router.post('/', requireRole('admin', 'manager'), buyBoxController.createBuyBox);

// PUT /api/buyboxes/:id - Update buy box (admin/manager only)
router.put('/:id', requireRole('admin', 'manager'), buyBoxController.updateBuyBox);

// POST /api/buyboxes/:id/toggle - Toggle active status (admin/manager only)
router.post('/:id/toggle', requireRole('admin', 'manager'), buyBoxController.toggleBuyBox);

module.exports = router;

