const express = require('express');
const authRequired = require('../middleware/authMiddleware');
const { propertyIntake } = require('../controllers/propertyIntakeController');

const router = express.Router();

/**
 * When PROPERTY_INTAKE_ALLOW_ANONYMOUS is not 'false', scrapers and unauthenticated clients may POST.
 * Set PROPERTY_INTAKE_ALLOW_ANONYMOUS=false to require JWT (cookie or Bearer).
 */
function propertyIntakeAuth(req, res, next) {
  if (process.env.PROPERTY_INTAKE_ALLOW_ANONYMOUS !== 'false') {
    return next();
  }
  return authRequired(req, res, next);
}

router.post('/intake', propertyIntakeAuth, propertyIntake);

module.exports = router;
