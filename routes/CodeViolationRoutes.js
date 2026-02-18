const express = require('express');
const router = express.Router();
const { getAll } = require('../controllers/codeViolationController');

router.get('/', getAll);

module.exports = router;