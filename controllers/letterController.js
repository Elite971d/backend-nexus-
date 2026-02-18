// controllers/letterController.js
const Lead = require('../models/Lead');
const { generateLeadLetter } = require('../utils/pdfGenerator');

// GET /api/letters/:id/letter
exports.getLetterPdf = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    generateLeadLetter(lead, res);
  } catch (err) {
    next(err);
  }
};