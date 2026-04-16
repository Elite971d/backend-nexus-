const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const intakeIntelligenceController = require('../controllers/intakeIntelligenceController');

router.use(authRequired);
router.use(requireRole('dialer', 'manager', 'admin'));

router.get('/geocode-suggest', intakeIntelligenceController.geocodeSuggest);
router.post('/address-check', intakeIntelligenceController.addressCheck);
router.post('/score-address', intakeIntelligenceController.scoreAddress);

module.exports = router;
