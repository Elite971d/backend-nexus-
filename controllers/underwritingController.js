// controllers/underwritingController.js
const Lead = require('../models/Lead');
const { underwriteLead } = require('../utils/underwriting');
const { emitToUser, emitToRole } = require('../utils/realtime');

/**
 * POST /api/underwrite/:leadId
 * Generate underwriting analysis for a lead
 */
exports.underwrite = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { useAI } = req.body || {};
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only admin and closer can underwrite
    if (userRole !== 'admin' && userRole !== 'closer') {
      return res.status(403).json({ error: 'Admin or closer access required' });
    }

    // Get lead with tenant scope
    const lead = await Lead.findOne({ 
      _id: leadId,
      tenantId: req.user.tenantId 
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Perform underwriting
    const analysis = await underwriteLead(lead, useAI === true);

    // Update lead with underwriting data
    lead.underwriting = {
      ...analysis,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: userId
    };
    await lead.save();

    // Emit real-time event
    emitToUser(userId, 'underwriting:completed', {
      leadId: lead._id,
      underwriting: lead.underwriting
    });

    res.json({
      leadId: lead._id,
      underwriting: lead.underwriting
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/underwrite/:leadId
 * Update underwriting with human edits
 */
exports.updateUnderwriting = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const updates = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only admin and closer can edit
    if (userRole !== 'admin' && userRole !== 'closer') {
      return res.status(403).json({ error: 'Admin or closer access required' });
    }

    // Get lead with tenant scope
    const lead = await Lead.findOne({ 
      _id: leadId,
      tenantId: req.user.tenantId 
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Update underwriting fields
    if (!lead.underwriting) {
      lead.underwriting = {};
    }

    if (updates.summaryText !== undefined) lead.underwriting.summaryText = updates.summaryText;
    if (updates.suggestedLane !== undefined) lead.underwriting.suggestedLane = updates.suggestedLane;
    if (updates.suggestedPriceRange !== undefined) lead.underwriting.suggestedPriceRange = updates.suggestedPriceRange;
    if (updates.assumptions !== undefined) lead.underwriting.assumptions = updates.assumptions;
    if (updates.missingFields !== undefined) lead.underwriting.missingFields = updates.missingFields;
    if (updates.risks !== undefined) lead.underwriting.risks = updates.risks;

    lead.underwriting.updatedAt = new Date();
    lead.underwriting.updatedBy = userId;

    await lead.save();

    // Emit real-time event
    emitToUser(userId, 'underwriting:updated', {
      leadId: lead._id,
      underwriting: lead.underwriting
    });

    res.json({
      leadId: lead._id,
      underwriting: lead.underwriting
    });
  } catch (err) {
    next(err);
  }
};

