const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const { getLetterPdf } = require('../controllers/letterController');

// protect letters if you want; or remove authRequired
router.get('/:id/letter', authRequired, getLetterPdf);

module.exports = router;