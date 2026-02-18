const Probate = require('../models/Probate');

exports.getAll = async (req, res, next) => {
  try {
    const rows = await Probate.find().sort({ createdAt: -1 }).limit(500);
    res.json(rows || []);
  } catch (err) {
    // Never crash - return empty array on error
    console.error('Error fetching probate:', err);
    res.json([]);
  }
};
