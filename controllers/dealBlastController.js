// controllers/dealBlastController.js
const DealBlast = require('../models/DealBlast');
const DealBlastRecipient = require('../models/DealBlastRecipient');
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const Template = require('../models/Template');
const { matchBuyersForLead, determineMarketKey } = require('../services/buyerMatchingService');
const { formatDealPackageAsText, formatDealPackageAsHTML } = require('../utils/dealPackageFormatter');
const { getProvider, getAvailableProviders } = require('../services/outboundProviders');

/**
 * GET /api/deal-blasts/leads/:leadId/matches
 * Preview buyer matches for a lead
 * Query params: channel (internal|sms|email)
 */
exports.previewMatches = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { channel = 'internal' } = req.query;
    
    if (!['internal', 'sms', 'email'].includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel. Must be internal, sms, or email' });
    }
    
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Check routing - don't allow blasts for archived leads
    if (lead.routing?.route === 'archive') {
      return res.status(400).json({ 
        error: 'Cannot create blast for archived lead',
        routing: lead.routing.route
      });
    }
    
    // Get matches
    const matches = await matchBuyersForLead(lead, { channel, maxResults: 100 });
    
    // Separate matched and excluded
    const matched = matches.filter(m => !m.excluded);
    const excluded = matches.filter(m => m.excluded);
    
    res.json({
      leadId: lead._id,
      marketKey: determineMarketKey(lead),
      grade: lead.leadScore?.grade || 'Dead',
      channel,
      matched: matched.map(m => ({
        buyerId: m.buyer._id,
        buyerName: m.buyer.name || m.buyer.entityName,
        score: m.score,
        reasons: m.reasons,
        preferences: {
          markets: m.buyer.preferredMarkets || m.buyer.markets,
          propertyTypes: m.buyer.propertyTypes,
          maxBuyPrice: m.buyer.maxBuyPrice,
          minArv: m.buyer.minArv
        }
      })),
      excluded: excluded.map(e => ({
        buyerId: e.buyer._id,
        buyerName: e.buyer.name || e.buyer.entityName,
        exclusionReason: e.exclusionReason
      })),
      summary: {
        totalMatched: matched.length,
        totalExcluded: excluded.length,
        availableProviders: getAvailableProviders()
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/deal-blasts
 * Create a deal blast draft
 * Body: { leadId, channel, messageTemplateKey, maxRecipients }
 */
exports.createBlast = async (req, res, next) => {
  try {
    const { leadId, channel, messageTemplateKey, maxRecipients = 25 } = req.body;
    const userId = req.user._id;
    
    if (!leadId || !channel || !messageTemplateKey) {
      return res.status(400).json({ 
        error: 'Missing required fields: leadId, channel, messageTemplateKey' 
      });
    }
    
    if (!['internal', 'sms', 'email'].includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel. Must be internal, sms, or email' });
    }
    
    // Validate max recipients
    const maxRecipientsNum = parseInt(maxRecipients);
    if (isNaN(maxRecipientsNum) || maxRecipientsNum < 1 || maxRecipientsNum > 100) {
      return res.status(400).json({ error: 'maxRecipients must be between 1 and 100' });
    }
    
    // Get lead
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Check routing - don't allow blasts for archived leads
    if (lead.routing?.route === 'archive') {
      return res.status(400).json({ 
        error: 'Cannot create blast for archived lead',
        routing: lead.routing.route
      });
    }
    
    // Get template
    const template = await Template.findOne({
      key: messageTemplateKey,
      status: 'active'
    });
    
    if (!template) {
      return res.status(404).json({ error: `Template not found or not active: ${messageTemplateKey}` });
    }
    
    // Get market key
    const marketKey = determineMarketKey(lead);
    if (!marketKey) {
      return res.status(400).json({ error: 'Could not determine market for lead' });
    }
    
    // Get matches
    const matches = await matchBuyersForLead(lead, { channel, maxResults: maxRecipientsNum });
    const matchedBuyers = matches.filter(m => !m.excluded).slice(0, maxRecipientsNum);
    
    if (matchedBuyers.length === 0) {
      return res.status(400).json({ 
        error: 'No matched buyers found for this lead',
        channel,
        marketKey
      });
    }
    
    // Create blast
    const blast = new DealBlast({
      leadId: lead._id,
      marketKey,
      gradeAtBlast: lead.leadScore?.grade || 'Dead',
      createdBy: userId,
      channel,
      status: 'draft',
      messageTemplateKey,
      stats: {
        recipients: matchedBuyers.length
      }
    });
    
    await blast.save();
    
    // Create recipient records
    const recipients = [];
    for (const match of matchedBuyers) {
      const recipient = new DealBlastRecipient({
        dealBlastId: blast._id,
        buyerId: match.buyer._id,
        channel,
        status: 'queued'
      });
      await recipient.save();
      recipients.push(recipient);
    }
    
    res.status(201).json({
      blast: {
        _id: blast._id,
        leadId: blast.leadId,
        channel: blast.channel,
        status: blast.status,
        messageTemplateKey: blast.messageTemplateKey,
        stats: blast.stats,
        createdAt: blast.createdAt
      },
      recipients: recipients.map(r => ({
        _id: r._id,
        buyerId: r.buyerId,
        status: r.status
      })),
      summary: {
        totalRecipients: recipients.length,
        marketKey,
        grade: blast.gradeAtBlast
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/deal-blasts/:id/send
 * Send a deal blast
 */
exports.sendBlast = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const blast = await DealBlast.findById(id);
    if (!blast) {
      return res.status(404).json({ error: 'Deal blast not found' });
    }
    
    if (blast.status !== 'draft') {
      return res.status(400).json({ 
        error: `Cannot send blast with status: ${blast.status}. Only draft blasts can be sent.` 
      });
    }
    
    // Re-check lead routing
    const lead = await Lead.findById(blast.leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    if (lead.routing?.route === 'archive') {
      return res.status(400).json({ 
        error: 'Cannot send blast for archived lead',
        routing: lead.routing.route
      });
    }
    
    // Get template
    const template = await Template.findOne({
      key: blast.messageTemplateKey,
      status: 'active'
    });
    
    if (!template) {
      return res.status(404).json({ error: `Template not found or not active: ${blast.messageTemplateKey}` });
    }
    
    // Get recipients
    const recipients = await DealBlastRecipient.find({
      dealBlastId: blast._id,
      status: 'queued'
    }).populate('buyerId');
    
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No queued recipients found' });
    }
    
    // Get provider
    const provider = getProvider(blast.channel);
    if (!provider.isConfigured() && blast.channel !== 'internal') {
      return res.status(400).json({ 
        error: `${blast.channel} provider not configured. Falling back to internal.`,
        availableProviders: getAvailableProviders()
      });
    }
    
    // Rate limiting check (simple implementation - could be enhanced)
    const recentBlasts = await DealBlast.countDocuments({
      createdBy: userId,
      status: 'sent',
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });
    
    const maxBlastsPerHour = parseInt(process.env.MAX_BLASTS_PER_HOUR) || 10;
    if (recentBlasts >= maxBlastsPerHour) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Too many blasts sent in the last hour.',
        limit: maxBlastsPerHour
      });
    }
    
    // Format deal package
    const { formatDealPackageAsText, formatDealPackageAsHTML } = require('../utils/dealPackageFormatter');
    const dealText = formatDealPackageAsText(lead, { redacted: true });
    const dealHTML = formatDealPackageAsHTML(lead, { redacted: true });
    
    // Replace template variables (simple implementation)
    let message = template.content;
    message = message.replace(/\{\{dealPackage\}\}/g, dealText);
    message = message.replace(/\{\{dealPackageHTML\}\}/g, dealHTML);
    message = message.replace(/\{\{leadId\}\}/g, lead._id.toString());
    message = message.replace(/\{\{address\}\}/g, lead.propertyAddress || 'Address TBD');
    
    // Send to each recipient
    let sentCount = 0;
    let failedCount = 0;
    
    for (const recipient of recipients) {
      try {
        const buyer = recipient.buyerId;
        
        // Determine recipient address based on channel
        let to = null;
        if (blast.channel === 'sms') {
          to = buyer.phones && buyer.phones.length > 0 ? buyer.phones[0] : null;
        } else if (blast.channel === 'email') {
          to = buyer.emails && buyer.emails.length > 0 ? buyer.emails[0] : null;
        } else {
          to = buyer._id.toString(); // For internal, use buyer ID
        }
        
        if (!to) {
          recipient.status = 'failed';
          recipient.reasonExcluded = `No ${blast.channel} contact info available`;
          await recipient.save();
          failedCount++;
          continue;
        }
        
        // Send message
        const sendParams = {
          to,
          message: message,
          dealBlastRecipientId: recipient._id.toString(),
          metadata: {
            leadId: lead._id.toString(),
            buyerId: buyer._id.toString(),
            blastId: blast._id.toString()
          }
        };
        
        // Add subject for email
        if (blast.channel === 'email') {
          sendParams.subject = `New Deal Opportunity - ${lead.propertyAddress || 'Property'}`;
          sendParams.html = dealHTML;
        }
        
        const result = await provider.send(sendParams);
        
        // Update recipient
        recipient.status = 'sent';
        recipient.sentAt = new Date();
        recipient.tracking = {
          messageId: result.messageId,
          provider: result.provider
        };
        await recipient.save();
        
        // Update buyer lastBlastAt
        buyer.lastBlastAt = new Date();
        await buyer.save();
        
        sentCount++;
      } catch (error) {
        console.error(`[Deal Blast] Error sending to recipient ${recipient._id}:`, error.message);
        recipient.status = 'failed';
        recipient.reasonExcluded = error.message;
        await recipient.save();
        failedCount++;
      }
    }
    
    // Update blast
    blast.status = 'sent';
    blast.sentAt = new Date();
    blast.stats = {
      recipients: recipients.length,
      delivered: sentCount,
      failed: failedCount,
      replies: 0,
      interested: 0,
      notInterested: 0
    };
    await blast.save();
    
    // Create KPI events for buyer blast sent (one per closer if createdBy is a closer)
    try {
      const KpiEvent = require('../models/KpiEvent');
      const User = require('../models/User');
      const creator = await User.findById(blast.createdBy);
      if (creator && (creator.role === 'closer' || creator.role === 'manager' || creator.role === 'admin')) {
        // For managers/admins, check if we can determine the responsible closer
        // For now, log to the creator if they're a closer
        if (creator.role === 'closer') {
          await KpiEvent.create({
            userId: creator._id,
            role: 'closer',
            leadId: blast.leadId,
            eventType: 'buyer_blast_sent',
            metadata: {
              blastId: blast._id.toString(),
              channel: blast.channel,
              recipientCount: sentCount
            }
          });

          // Update CloserKPI (async)
          const { triggerCloserKPIUpdate } = require('../utils/closerKPIService');
          triggerCloserKPIUpdate(creator._id);
        }
      }
    } catch (kpiErr) {
      console.error('Failed to log buyer blast KPI:', kpiErr);
      // Don't fail the request if KPI logging fails
    }
    
    res.json({
      blast: {
        _id: blast._id,
        status: blast.status,
        sentAt: blast.sentAt,
        stats: blast.stats
      },
      summary: {
        totalRecipients: recipients.length,
        sent: sentCount,
        failed: failedCount
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/deal-blasts/:id/cancel
 * Cancel a deal blast (only if draft)
 */
exports.cancelBlast = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const blast = await DealBlast.findById(id);
    if (!blast) {
      return res.status(404).json({ error: 'Deal blast not found' });
    }
    
    if (blast.status === 'sent') {
      return res.status(400).json({ error: 'Cannot cancel a blast that has already been sent' });
    }
    
    if (blast.status === 'canceled') {
      return res.status(400).json({ error: 'Blast is already canceled' });
    }
    
    // Update blast
    blast.status = 'canceled';
    await blast.save();
    
    // Update recipients
    await DealBlastRecipient.updateMany(
      { dealBlastId: blast._id, status: 'queued' },
      { status: 'opted_out' } // Mark as opted out (effectively canceled)
    );
    
    res.json({
      blast: {
        _id: blast._id,
        status: blast.status,
        canceledAt: new Date()
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/deal-blasts/:id/response
 * Record buyer response (used by internal UI or webhooks)
 * Body: { recipientId, responseText, status: 'interested'|'not_interested'|'replied' }
 */
exports.recordResponse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { recipientId, responseText, status } = req.body;
    
    if (!recipientId || !status) {
      return res.status(400).json({ error: 'Missing required fields: recipientId, status' });
    }
    
    if (!['interested', 'not_interested', 'replied'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be interested, not_interested, or replied' 
      });
    }
    
    const blast = await DealBlast.findById(id);
    if (!blast) {
      return res.status(404).json({ error: 'Deal blast not found' });
    }
    
    const recipient = await DealBlastRecipient.findOne({
      _id: recipientId,
      dealBlastId: blast._id
    });
    
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    // Check for opt-out keywords
    const optOutKeywords = ['stop', 'unsubscribe', 'opt out', 'remove'];
    const responseLower = (responseText || '').toLowerCase();
    const hasOptOut = optOutKeywords.some(keyword => responseLower.includes(keyword));
    
    if (hasOptOut) {
      // Update buyer opt-out
      const buyer = await Buyer.findById(recipient.buyerId);
      if (buyer) {
        if (blast.channel === 'sms') {
          buyer.optOut = { ...buyer.optOut, sms: true, updatedAt: new Date() };
        } else if (blast.channel === 'email') {
          buyer.optOut = { ...buyer.optOut, email: true, updatedAt: new Date() };
        }
        await buyer.save();
      }
      
      recipient.status = 'opted_out';
    } else {
      recipient.status = status;
    }
    
    recipient.respondedAt = new Date();
    recipient.responseText = responseText || recipient.responseText;
    await recipient.save();
    
    // Create buyer feedback record (if not opted out)
    if (!hasOptOut && status !== 'replied') {
      try {
        const BuyerFeedback = require('../models/BuyerFeedback');
        let feedbackResponseType = 'pass';
        if (status === 'interested') {
          feedbackResponseType = 'interested';
        } else if (status === 'not_interested') {
          // Parse response text to determine feedback type
          const responseLower = (responseText || '').toLowerCase();
          if (responseLower.includes('too high') || responseLower.includes('price') || responseLower.includes('expensive')) {
            feedbackResponseType = 'price_too_high';
          } else if (responseLower.includes('wrong market') || responseLower.includes('wrong area')) {
            feedbackResponseType = 'wrong_market';
          } else if (responseLower.includes('more info') || responseLower.includes('details')) {
            feedbackResponseType = 'needs_more_info';
          } else {
            feedbackResponseType = 'pass';
          }
        }
        
        const feedback = await BuyerFeedback.create({
          buyerId: recipient.buyerId,
          leadId: blast.leadId,
          responseType: feedbackResponseType,
          optionalNotes: responseText || '',
          source: blast.channel === 'sms' ? 'sms' : blast.channel === 'email' ? 'email' : 'manual',
          dealBlastRecipientId: recipient._id,
          recordedBy: req.user?.id || null
        });

        // Create notification if buyer is interested
        if (status === 'interested' || feedbackResponseType === 'interested') {
          try {
            const { notifyBuyerInterest } = require('../services/notificationService');
            const buyer = await Buyer.findById(recipient.buyerId);
            const lead = await Lead.findById(blast.leadId);
            const userId = blast.createdBy;
            if (buyer && lead && userId) {
              await notifyBuyerInterest(buyer, lead, userId);
            }
          } catch (notifErr) {
            console.error('Failed to create buyer interest notification:', notifErr);
          }
        }

        // Update buyer quality scores (async)
        const { updateBuyerQualityScores } = require('../utils/buyerQualityScoring');
        updateBuyerQualityScores(recipient.buyerId).catch(err => {
          console.error('Failed to update buyer quality scores:', err);
        });

        // Run price discovery (async)
        const { runPriceDiscovery } = require('../utils/priceDiscovery');
        runPriceDiscovery(blast.leadId).catch(err => {
          console.error('Failed to run price discovery:', err);
        });
      } catch (feedbackErr) {
        console.error('Failed to create buyer feedback:', feedbackErr);
        // Don't fail the request if feedback creation fails
      }
    }
    
    // Update blast stats
    if (status === 'interested') {
      blast.stats.interested = (blast.stats.interested || 0) + 1;
    } else if (status === 'not_interested') {
      blast.stats.notInterested = (blast.stats.notInterested || 0) + 1;
    }
    
    if (status === 'replied' || hasOptOut) {
      blast.stats.replies = (blast.stats.replies || 0) + 1;
    }
    
    await blast.save();
    
    res.json({
      recipient: {
        _id: recipient._id,
        status: recipient.status,
        respondedAt: recipient.respondedAt,
        responseText: recipient.responseText
      },
      blast: {
        _id: blast._id,
        stats: blast.stats
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/deal-blasts
 * List deal blasts (with filtering)
 * Query params: leadId, status, channel, createdBy
 */
exports.listBlasts = async (req, res, next) => {
  try {
    const { leadId, status, channel, createdBy } = req.query;
    
    const query = {};
    if (leadId) query.leadId = leadId;
    if (status) query.status = status;
    if (channel) query.channel = channel;
    if (createdBy) query.createdBy = createdBy;
    
    const blasts = await DealBlast.find(query)
      .populate('leadId', 'propertyAddress ownerName')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json(blasts);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/deal-blasts/:id
 * Get single deal blast with recipients
 */
exports.getBlast = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const blast = await DealBlast.findById(id)
      .populate('leadId')
      .populate('createdBy', 'name email');
    
    if (!blast) {
      return res.status(404).json({ error: 'Deal blast not found' });
    }
    
    const recipients = await DealBlastRecipient.find({ dealBlastId: blast._id })
      .populate('buyerId', 'name entityName phones emails');
    
    res.json({
      blast,
      recipients: recipients.map(r => ({
        _id: r._id,
        buyer: {
          _id: r.buyerId._id,
          name: r.buyerId.name || r.buyerId.entityName
        },
        channel: r.channel,
        status: r.status,
        sentAt: r.sentAt,
        respondedAt: r.respondedAt,
        responseText: r.responseText,
        tracking: r.tracking
      }))
    });
  } catch (err) {
    next(err);
  }
};

