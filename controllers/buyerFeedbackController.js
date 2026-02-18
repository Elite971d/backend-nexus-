// controllers/buyerFeedbackController.js
const BuyerFeedback = require('../models/BuyerFeedback');
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const { updateBuyerQualityScores } = require('../utils/buyerQualityScoring');
const { runPriceDiscovery } = require('../utils/priceDiscovery');

/**
 * POST /api/buyer-feedback
 * Create buyer feedback record
 */
exports.createFeedback = async (req, res, next) => {
  try {
    const { buyerId, leadId, responseType, optionalNotes, source, dealBlastRecipientId } = req.body;

    // Validation
    if (!buyerId || !leadId || !responseType) {
      return res.status(400).json({ error: 'Missing required fields: buyerId, leadId, responseType' });
    }

    const validResponseTypes = ['interested', 'pass', 'price_too_high', 'needs_more_info', 'wrong_market'];
    if (!validResponseTypes.includes(responseType)) {
      return res.status(400).json({ error: `Invalid responseType. Must be one of: ${validResponseTypes.join(', ')}` });
    }

    const validSources = ['sms', 'email', 'manual'];
    if (source && !validSources.includes(source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` });
    }

    // Verify lead and buyer exist
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const buyer = await Buyer.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }

    // Create feedback
    const feedback = await BuyerFeedback.create({
      buyerId,
      leadId,
      responseType,
      optionalNotes: optionalNotes || '',
      source: source || 'manual',
      dealBlastRecipientId: dealBlastRecipientId || null,
      recordedBy: req.user?.id || null
    });

    // Update buyer quality scores (async, don't block)
    updateBuyerQualityScores(buyerId).catch(err => {
      console.error('Failed to update buyer quality scores:', err);
    });

    // Run price discovery (async, don't block)
    runPriceDiscovery(leadId).catch(err => {
      console.error('Failed to run price discovery:', err);
    });

    // Create notification for buyer interest (if interested)
    if (responseType === 'interested') {
      try {
        const { notifyBuyerInterest } = require('../services/notificationService');
        const User = require('../models/user');
        // Notify admins and closers
        const users = await User.find({ 
          tenantId: lead.tenantId,
          role: { $in: ['admin', 'closer', 'manager'] } 
        });
        for (const user of users) {
          await notifyBuyerInterest(buyer, lead, user._id);
        }
      } catch (notifErr) {
        console.error('Failed to create buyer interest notification:', notifErr);
      }
    }

    // Emit real-time events
    try {
      const { emitToTenant, emitToRole, emitToRoom } = require('../utils/realtime');
      if (lead.tenantId) {
        emitToTenant(lead.tenantId, 'buyer:interest', { 
          leadId: lead._id, 
          buyerId: buyer._id,
          feedback,
          responseType
        });
        emitToRole('closer', 'buyer:interest', { 
          leadId: lead._id, 
          buyerId: buyer._id,
          feedback,
          responseType
        });
        emitToRoom(`lead:${lead._id}`, 'buyer:interest', { 
          leadId: lead._id, 
          buyerId: buyer._id,
          feedback,
          responseType
        });
      }
    } catch (emitErr) {
      console.error('Failed to emit buyer interest event:', emitErr);
      // Don't fail the request
    }

    res.status(201).json(feedback);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leads/:id/feedback
 * Get all feedback for a lead
 */
exports.getLeadFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const feedback = await BuyerFeedback.find({ leadId: id })
      .populate('buyerId', 'name email phone entityName')
      .populate('recordedBy', 'name email')
      .sort({ createdAt: -1 });

    // Aggregate stats
    const stats = {
      total: feedback.length,
      interested: feedback.filter(f => f.responseType === 'interested').length,
      pass: feedback.filter(f => f.responseType === 'pass').length,
      price_too_high: feedback.filter(f => f.responseType === 'price_too_high').length,
      needs_more_info: feedback.filter(f => f.responseType === 'needs_more_info').length,
      wrong_market: feedback.filter(f => f.responseType === 'wrong_market').length
    };

    res.json({
      feedback,
      stats
    });
  } catch (err) {
    next(err);
  }
};

