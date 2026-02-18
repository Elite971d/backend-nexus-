const TaxLien = require('../models/TaxLien');

exports.getAll = async (req, res, next) => {
  try {
    const rows = await TaxLien.find().sort({ createdAt: -1 }).limit(500);
    res.json(rows || []);
  } catch (err) {
    // Never crash - return empty array on error
    console.error('Error fetching tax liens:', err);
    res.json([]);
  }
};