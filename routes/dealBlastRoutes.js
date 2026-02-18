// routes/dealBlastRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const dealBlastController = require('../controllers/dealBlastController');

// All routes require auth
router.use(authRequired);

// GET /api/deal-blasts/leads/:leadId/matches - Preview matches
router.get('/leads/:leadId/matches', 
  requireRole('admin', 'manager', 'closer'), 
  dealBlastController.previewMatches
);

// GET /api/deal-blasts - List blasts
router.get('/', 
  requireRole('admin', 'manager', 'closer'), 
  dealBlastController.listBlasts
);

// GET /api/deal-blasts/:id - Get single blast
router.get('/:id', 
  requireRole('admin', 'manager', 'closer'), 
  dealBlastController.getBlast
);

// POST /api/deal-blasts - Create blast draft
router.post('/', 
  requireRole('admin', 'manager', 'closer'), 
  dealBlastController.createBlast
);

// POST /api/deal-blasts/:id/send - Send blast
router.post('/:id/send', 
  requireRole('admin', 'manager', 'closer'), 
  dealBlastController.sendBlast
);

// POST /api/deal-blasts/:id/cancel - Cancel blast
router.post('/:id/cancel', 
  requireRole('admin', 'manager'), 
  dealBlastController.cancelBlast
);

// POST /api/deal-blasts/:id/response - Record response
router.post('/:id/response', 
  requireRole('admin', 'manager', 'closer'), 
  dealBlastController.recordResponse
);

module.exports = router;

