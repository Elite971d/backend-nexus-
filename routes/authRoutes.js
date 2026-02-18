const express = require('express');
const { requestLink, verify, logout, register, me } = require('../controllers/authControllers');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for auth is applied in app.js (authLimiter)

router.post('/request-link', requestLink);
router.get('/verify', verify);
router.get('/me', authRequired, me);
router.post('/logout', logout);
router.post('/register', register);

module.exports = router;
