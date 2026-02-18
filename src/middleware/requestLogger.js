/**
 * Request logging with pino-http and correlation IDs.
 * Adds req.correlationId and req.log for request-scoped logging.
 */
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

const genReqId = (req) => {
  return req.headers['x-correlation-id'] || req.headers['x-request-id'] || randomUUID();
};

const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => genReqId(req),
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `Request error: ${err.message}`,
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'responseTime',
  },
});

/** Attach correlationId to req for downstream use */
const correlationIdMiddleware = (req, res, next) => {
  req.correlationId = req.id || genReqId(req);
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
};

module.exports = { requestLogger, correlationIdMiddleware };
