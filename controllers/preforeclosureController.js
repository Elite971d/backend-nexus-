const Preforeclosure = require('../models/PreForeclosure');

exports.getAll = async (req, res, next) => {
  try {
    const rows = await Preforeclosure.find().sort({ createdAt: -1 }).limit(500);
    res.json(rows || []);
  } catch (err) {
    // Never crash - return empty array on error
    console.error('Error fetching preforeclosures:', err);
    res.json([]);
  }
};