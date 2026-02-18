// middleware/errorHandler.js
function errorHandler(err, req, res, next) {
    console.error('Unhandled error:', err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.message || 'Server error' });
  }
  
  module.exports = errorHandler;