const express = require('express');
const router = express.Router();
const { getAll } = require('../controllers/taxLienController');

router.get('/', getAll);

module.exports = router;