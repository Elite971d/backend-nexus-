// routes/dealPerformanceRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const dealPerformanceController = require('../controllers/dealPerformanceController');

// All performance routes require auth
router.use(authRequired);

// POST /api/deals/:id/performance - Create performance record with pro forma snapshot
router.post('/deals/:id/performance', requireRole('admin', 'manager', 'closer'), dealPerformanceController.createPerformanceRecord);

// GET /api/deals/:id/performance - Get performance record for a deal
router.get('/deals/:id/performance', requireRole('admin', 'manager', 'closer', 'dialer'), dealPerformanceController.getPerformance);

// POST /api/deals/:id/performance/periods - Add new performance period
router.post('/deals/:id/performance/periods', requireRole('admin', 'manager'), dealPerformanceController.addPerformancePeriod);

// PUT /api/deals/:id/performance/:periodId - Update performance period
router.put('/deals/:id/performance/:periodId', requireRole('admin', 'manager'), dealPerformanceController.updatePerformancePeriod);

// GET /api/performance/buybox/:buyBoxId - Get buy box performance metrics
router.get('/performance/buybox/:buyBoxId', requireRole('admin', 'manager'), dealPerformanceController.getBuyBoxPerformance);

// GET /api/performance/analytics - Get performance analytics with filtering
router.get('/performance/analytics', requireRole('admin', 'manager'), dealPerformanceController.getPerformanceAnalytics);

// GET /api/performance/warnings - Get buy box performance warnings
router.get('/performance/warnings', requireRole('admin', 'manager'), dealPerformanceController.getPerformanceWarnings);

// POST /api/performance/recalculate-feedback - Recalculate all feedback loops
router.post('/performance/recalculate-feedback', requireRole('admin'), dealPerformanceController.recalculateFeedback);

module.exports = router;

