/**
 * Centralized error handler for Express.
 * Handles operational errors, validation errors, and unknown errors.
 * Logs with correlation ID when present.
 */
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const correlationId = req.correlationId || req.headers['x-correlation-id'] || null;
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Server error';

  const logContext = {
    correlationId,
    path: req.path,
    method: req.method,
    statusCode,
    name: err.name,
  };

  if (statusCode >= 500) {
    logger.error({ ...logContext, err, stack: err.stack }, 'Unhandled error');
  } else {
    logger.warn({ ...logContext, message }, 'Client error');
  }

  const payload = {
    error: message,
    ...(correlationId && { correlationId }),
  };

  if (err.code) payload.code = err.code;
  if (err.details && Array.isArray(err.details)) payload.details = err.details;

  res.status(statusCode).json(payload);
}

module.exports = errorHandler;
