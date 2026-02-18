/**
 * Pino logger with structured JSON output.
 * Use req.log in request handlers (injected by pino-http).
 */
const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
});

module.exports = logger;
