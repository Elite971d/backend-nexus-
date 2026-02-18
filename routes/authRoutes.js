const express = require('express');
const { login, logout, register, me } = require('../controllers/authControllers');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Auth rate limiting applied in app.js (stricter: 10/15min)

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authRequired, me);
router.post('/register', register);

module.exports = router;
