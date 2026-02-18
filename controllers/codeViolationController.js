const CodeViolation = require('../models/CodeViolation');

exports.getAll = async (req, res, next) => {
  try {
    const rows = await CodeViolation.find().sort({ createdAt: -1 }).limit(500);
    res.json(rows || []);
  } catch (err) {
    // Never crash - return empty array on error
    console.error('Error fetching code violations:', err);
    res.json([]);
  }
};