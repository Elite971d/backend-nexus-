const express = require('express');
const router = express.Router();
const { getAll } = require('../controllers/probateController');

router.get('/', getAll);

module.exports = router;