// controllers/skipTraceController.js
const Lead = require('../models/Lead');
const { skipTraceLead, estimateSkipTraceCost } = require('../services/skipTraceService');

/**
 * POST /api/skiptrace/:leadId
 * Request skip trace for a lead
 */
exports.requestSkipTrace = async (req, res, next) => {
  try {
    const leadId = req.params.leadId || req.params.id; // Support both :leadId and :id
    const userId = req.user.id;

    // Check if lead exists
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if skip trace is locked (unless admin)
    if (lead.skipTraceLocked && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Skip trace is locked. Only admin can unlock and re-run.'
      });
    }

    // Perform skip trace
    const updatedLead = await skipTraceLead(leadId, userId);

    res.json({
      message: 'Skip trace requested successfully',
      lead: updatedLead
    });
  } catch (err) {
    if (err.message === 'Lead not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('locked')) {
      return res.status(403).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * GET /api/skiptrace/leads/:id
 * Get skip trace data for a lead
 */
exports.getSkipTrace = async (req, res, next) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id).select('skipTrace skipTraceLocked ownerName propertyAddress');
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Dialers can only see basic status, not full data
    // Closers and above can see full data
    const isDialer = req.user.role === 'dialer';
    
    if (isDialer) {
      // Return limited data for dialers
      res.json({
        status: lead.skipTrace.status,
        confidenceScore: lead.skipTrace.confidenceScore,
        phonesCount: lead.skipTrace.phones?.length || 0,
        emailsCount: lead.skipTrace.emails?.length || 0,
        // Don't expose actual phone/email numbers to dialers
        phones: [],
        emails: [],
        mailingAddresses: [],
        entityInfo: null
      });
    } else {
      // Full data for closer/manager/admin
      res.json({
        skipTrace: lead.skipTrace,
        skipTraceLocked: lead.skipTraceLocked
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/skiptrace/leads/:id/lock
 * Lock/unlock skip trace (admin only)
 */
exports.lockSkipTrace = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { locked } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    lead.skipTraceLocked = locked !== false; // Default to true if not specified
    await lead.save();

    res.json({
      message: `Skip trace ${lead.skipTraceLocked ? 'locked' : 'unlocked'}`,
      skipTraceLocked: lead.skipTraceLocked
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/skiptrace/leads/:id/estimate
 * Estimate cost for skip trace
 */
exports.estimateCost = async (req, res, next) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const cost = await estimateSkipTraceCost(id);

    res.json({ estimatedCost: cost });
  } catch (err) {
    next(err);
  }
};

