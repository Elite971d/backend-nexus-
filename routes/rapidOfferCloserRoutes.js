// routes/rapidOfferCloserRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const closerController = require('../controllers/rapidOfferCloserController');

// All closer routes require auth and closer/manager/admin role
router.use(authRequired);
router.use(requireRole('closer', 'manager', 'admin'));

router.get('/queue', closerController.getQueue);
router.get('/leads/:id', closerController.getLead);
router.get('/leads/:id/buyer-matches', closerController.previewBuyerMatches);
router.get('/leads/:id/matching-buyers', closerController.getMatchingBuyers);
router.get('/leads/:id/blasts', closerController.getLeadBlasts);
router.post('/leads/:id/send-buyer-blast', closerController.sendBuyerBlast);
router.post('/leads/:id/request-info', closerController.requestInfo);
router.post('/leads/:id/offer', closerController.setOffer);
router.post('/leads/:id/mark-offer-sent', closerController.markOfferSent);
router.post('/leads/:id/mark-contract-sent', closerController.markContractSent);
router.post('/leads/:id/mark-under-contract', closerController.markUnderContract);
router.post('/leads/:id/override-score', closerController.overrideScore);
router.post('/leads/:id/override-routing', closerController.overrideRouting);

module.exports = router;
