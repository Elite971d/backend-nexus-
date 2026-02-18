// routes/buyerBlastRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const buyerBlastController = require('../controllers/buyerBlastController');

// All routes require auth
router.use(authRequired);

// GET /api/buyer-blast/:leadId/preview - Preview eligible buyers
router.get('/:leadId/preview', 
  requireRole('admin', 'manager', 'closer'), 
  buyerBlastController.previewSmsBlast
);

// POST /api/buyer-blast/:leadId/sms - Send SMS blast
router.post('/:leadId/sms', 
  requireRole('admin', 'manager', 'closer'), 
  buyerBlastController.sendSmsBlast
);

module.exports = router;
