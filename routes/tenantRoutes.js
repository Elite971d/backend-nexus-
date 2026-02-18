// routes/tenantRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const tenantController = require('../controllers/tenantController');

// All tenant endpoints require auth
router.post('/', authRequired, tenantController.createTenant);
router.get('/', authRequired, tenantController.getTenants);
router.get('/me', authRequired, tenantController.getMyTenant);
router.post('/:id/invite', authRequired, tenantController.inviteUser);

module.exports = router;

