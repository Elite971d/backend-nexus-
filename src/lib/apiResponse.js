// src/lib/apiResponse.js — Consistent API response and error shapes
function success(res, data, statusCode = 200) {
  return res.status(statusCode).json(data);
}

function created(res, data) {
  return res.status(201).json(data);
}

/**
 * Consistent JSON error format for validation and application errors.
 * { error: string, code?: string, details?: array }
 */
function error(res, message, options = {}) {
  const { statusCode = 400, code, details } = options;
  const body = { error: message };
  if (code) body.code = code;
  if (details && details.length) body.details = details;
  return res.status(statusCode).json(body);
}

function notFound(res, resource = 'Resource') {
  return error(res, `${resource} not found`, { statusCode: 404, code: 'NOT_FOUND' });
}

function validationError(res, message, details = []) {
  return error(res, message, { statusCode: 422, code: 'VALIDATION_ERROR', details });
}

module.exports = {
  success,
  created,
  error,
  notFound,
  validationError
};
