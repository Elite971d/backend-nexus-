// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const messageController = require('../controllers/messageController');

// All message endpoints require auth
router.get('/threads', authRequired, messageController.getThreads);
router.get('/threads/:id', authRequired, messageController.getThreadMessages);
router.post('/send', authRequired, messageController.sendMessage);
router.post('/read/:id', authRequired, messageController.markMessageRead);

module.exports = router;

