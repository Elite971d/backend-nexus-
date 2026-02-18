// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

// All notification endpoints require auth
router.get('/', authRequired, notificationController.getNotifications);
router.post('/mark-read/:id', authRequired, notificationController.markRead);
router.post('/mark-all-read', authRequired, notificationController.markAllRead);

module.exports = router;

