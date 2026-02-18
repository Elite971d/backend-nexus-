const express = require('express');
const router = express.Router();
const exp = require('../controllers/exportController');

// Export routes: /api/export/preforeclosures, /api/export/taxliens, etc.
router.get('/export/preforeclosures', exp.exportPreforeclosures);
router.get('/export/taxliens', exp.exportTaxLiens);
router.get('/export/codeviolations', exp.exportCodeViolations);
router.get('/export/probate', exp.exportProbate);

module.exports = router;