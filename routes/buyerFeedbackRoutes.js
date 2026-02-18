// routes/buyerFeedbackRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const buyerFeedbackController = require('../controllers/buyerFeedbackController');

// All routes require auth
router.use(authRequired);

// POST /api/buyer-feedback - Create feedback
router.post('/', 
  requireRole('admin', 'manager', 'closer'), 
  buyerFeedbackController.createFeedback
);

// GET /api/leads/:id/feedback - Get feedback for a lead (already in crmRoutes, but adding here too for clarity)
// This will be handled via crmRoutes.js

module.exports = router;

