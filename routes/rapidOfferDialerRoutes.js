// routes/rapidOfferDialerRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const dialerController = require('../controllers/rapidOfferDialerController');

// All dialer routes require auth and dialer/manager/admin role
router.use(authRequired);
router.use(requireRole('dialer', 'manager', 'admin'));

router.get('/queue', dialerController.getQueue);
router.get('/leads/:id', dialerController.getLead);
router.post('/leads/:id/intake', dialerController.updateIntake);
router.post('/leads/:id/send-to-closer', dialerController.sendToCloser);

module.exports = router;
