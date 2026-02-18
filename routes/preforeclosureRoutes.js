const express = require('express');
const router = express.Router();
const { getAll } = require('../controllers/preforeclosureController');

router.get('/', getAll);

module.exports = router;