// routes/kpiRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const kpiController = require('../controllers/kpiController');

// All KPI routes require auth
router.use(authRequired);

router.post('/event', requireRole('dialer', 'closer', 'manager', 'admin'), kpiController.logEvent);
router.get('/dialer/weekly', requireRole('dialer', 'manager', 'admin'), kpiController.getDialerWeekly);
router.get('/offshore/weekly', requireRole('dialer', 'manager', 'admin'), kpiController.getOffshoreWeekly);
router.get('/closer/pipeline', requireRole('closer', 'manager', 'admin'), kpiController.getCloserPipeline);
router.get('/routing/performance', requireRole('manager', 'admin'), kpiController.getRoutingPerformance);
router.put('/scorecard/:id', requireRole('manager', 'admin'), kpiController.updateScorecard);

// New KPI endpoints
router.get('/closers', authRequired, kpiController.getCloserKPIs);
router.get('/leads/:id/pricing', authRequired, kpiController.getLeadPricingIntelligence);

module.exports = router;
