// routes/buyBoxOptimizationRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const buyBoxOptimizationController = require('../controllers/buyBoxOptimizationController');

// All optimization routes require auth and admin/manager role
router.use(authRequired);

// POST /api/buyboxes/optimize/generate - Generate recommendations (admin/manager only)
router.post('/generate', requireRole('admin', 'manager'), buyBoxOptimizationController.generateRecommendations);

// GET /api/buyboxes/optimize/recommendations - View recommendations (admin/manager only)
router.get('/recommendations', requireRole('admin', 'manager'), buyBoxOptimizationController.getRecommendations);

// POST /api/buyboxes/optimize/recommendations/:id/accept - Accept recommendation (admin/manager only)
router.post('/recommendations/:id/accept', requireRole('admin', 'manager'), buyBoxOptimizationController.acceptRecommendation);

// POST /api/buyboxes/optimize/recommendations/:id/reject - Reject recommendation (admin/manager only)
router.post('/recommendations/:id/reject', requireRole('admin', 'manager'), buyBoxOptimizationController.rejectRecommendation);

module.exports = router;

