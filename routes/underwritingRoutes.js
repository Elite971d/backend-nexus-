// routes/underwritingRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const underwritingController = require('../controllers/underwritingController');

// All underwriting endpoints require auth
router.post('/:leadId', authRequired, underwritingController.underwrite);
router.put('/:leadId', authRequired, underwritingController.updateUnderwriting);

module.exports = router;

