// controllers/buyerBlastController.js
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const BuyerBlastLog = require('../models/BuyerBlastLog');
const DigestQueue = require('../models/DigestQueue');
const { matchBuyersForLead } = require('../services/buyerMatchingService');
const { sendSmsToBuyers } = require('../utils/smsBlast');

/**
 * POST /api/buyer-blast/:leadId/sms
 * Send SMS blast to matched buyers for a lead
 * Body: { mode: "immediate" | "digest", thresholdScore?: number, limit?: number }
 */
exports.sendSmsBlast = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { mode = 'digest', thresholdScore = 70, limit = 50 } = req.body;
    const userId = req.user._id;
    
    if (!['immediate', 'digest'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be "immediate" or "digest"' });
    }
    
    // Get lead
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Check routing - don't allow blasts for archived leads
    if (lead.routing?.route === 'archive') {
      return res.status(400).json({ 
        error: 'Cannot send blast for archived lead',
        routing: lead.routing.route
      });
    }
    
    // Get matched buyers
    const matches = await matchBuyersForLead(lead, { channel: 'sms', maxResults: 200 });
    
    // Filter eligible buyers
    const eligibleBuyers = matches
      .filter(m => !m.excluded && m.score >= thresholdScore)
      .map(m => m.buyer)
      .filter(buyer => {
        // Additional filters for SMS eligibility
        if (!buyer.active) return false;
        if (buyer.smsOptOut || buyer.optOut?.sms) return false;
        if (!buyer.phone && (!buyer.phones || buyer.phones.length === 0)) return false;
        if (buyer.preferredContact && buyer.preferredContact !== 'sms' && buyer.preferredContact !== 'both') return false;
        return true;
      })
      .slice(0, limit);
    
    if (eligibleBuyers.length === 0) {
      return res.status(400).json({ 
        error: 'No eligible buyers found for SMS blast',
        matched: matches.filter(m => !m.excluded).length,
        eligible: 0
      });
    }
    
    const buyerIds = eligibleBuyers.map(b => b._id);
    
    if (mode === 'immediate') {
      // Send SMS immediately
      const results = await sendSmsToBuyers({
        buyerIds,
        leadId,
        userId,
        limit
      });
      
      // Log blast
      await BuyerBlastLog.create({
        leadId,
        buyerIds,
        channel: 'sms',
        messagePreview: `SMS blast for lead ${leadId}`,
        sentCount: results.sent,
        failedCount: results.failed,
        createdByUserId: userId
      });
      
      return res.json({
        mode: 'immediate',
        leadId,
        summary: {
          matched: matches.filter(m => !m.excluded).length,
          eligible: eligibleBuyers.length,
          sent: results.sent,
          failed: results.failed
        },
        results: results.results.slice(0, 10) // Return first 10 for preview
      });
    } else {
      // Queue for daily digest
      let queuedCount = 0;
      let skippedCount = 0;
      
      for (const buyerId of buyerIds) {
        try {
          // Get or create digest queue for buyer
          let queue = await DigestQueue.findOne({ buyerId });
          
          if (!queue) {
            queue = new DigestQueue({ buyerId, items: [] });
          }
          
          // Check if lead already in queue (dedupe)
          const existingItem = queue.items.find(item => 
            item.leadId.toString() === leadId.toString()
          );
          
          if (!existingItem) {
            // Find match score
            const match = matches.find(m => m.buyer._id.toString() === buyerId.toString());
            const matchScore = match ? match.score : 0;
            
            queue.items.push({
              leadId,
              matchScore,
              createdAt: new Date()
            });
            
            await queue.save();
            queuedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`[Buyer Blast] Error queueing for buyer ${buyerId}:`, error.message);
          skippedCount++;
        }
      }
      
      return res.json({
        mode: 'digest',
        leadId,
        summary: {
          matched: matches.filter(m => !m.excluded).length,
          eligible: eligibleBuyers.length,
          queued: queuedCount,
          skipped: skippedCount
        },
        message: `Queued ${queuedCount} buyers for daily digest`
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/buyer-blast/:leadId/preview
 * Preview eligible buyers for SMS blast (without sending)
 */
exports.previewSmsBlast = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { thresholdScore = 70 } = req.query;
    
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Get matched buyers
    const matches = await matchBuyersForLead(lead, { channel: 'sms', maxResults: 200 });
    
    // Filter eligible buyers
    const eligibleBuyers = matches
      .filter(m => !m.excluded && m.score >= thresholdScore)
      .map(m => ({
        buyerId: m.buyer._id,
        buyerName: m.buyer.name || m.buyer.entityName,
        score: m.score,
        phone: m.buyer.phone || (m.buyer.phones && m.buyer.phones[0]),
        preferredContact: m.buyer.preferredContact,
        smsOptOut: m.buyer.smsOptOut || m.buyer.optOut?.sms
      }))
      .filter(b => {
        if (!b.phone) return false;
        if (b.smsOptOut) return false;
        if (b.preferredContact && b.preferredContact !== 'sms' && b.preferredContact !== 'both') return false;
        return true;
      });
    
    res.json({
      leadId,
      summary: {
        totalMatched: matches.filter(m => !m.excluded).length,
        eligible: eligibleBuyers.length
      },
      eligibleBuyers: eligibleBuyers.slice(0, 50) // Preview first 50
    });
  } catch (err) {
    next(err);
  }
};
