const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const crm = require('../controllers/crmController');

// All CRM endpoints require auth
router.get('/leads', authRequired, crm.getLeads);
router.post('/leads', authRequired, crm.createLead);
router.post('/leads/:id/status', authRequired, crm.updateStatus);
router.post(
  '/leads/upload-csv',
  authRequired,
  crm.uploadCsvMiddleware,
  crm.uploadCsv
);

// Lead scoring endpoints
router.get('/leads/:id/score', authRequired, crm.getLeadScore);
router.post('/leads/:id/recalculate-score', authRequired, crm.recalculateScore);

// Buyer matching endpoint
router.get('/leads/:id/matching-buyers', authRequired, crm.getMatchingBuyers);

// Buyer feedback endpoints
const buyerFeedbackController = require('../controllers/buyerFeedbackController');
router.get('/leads/:id/feedback', authRequired, buyerFeedbackController.getLeadFeedback);

module.exports = router;