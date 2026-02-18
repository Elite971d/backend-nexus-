// controllers/rapidOfferCloserController.js
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const Template = require('../models/Template');
const KpiEvent = require('../models/KpiEvent');
const { matchBuyersForLead } = require('../services/buyerMatchingService');
const { matchBuyerToLead } = require('../utils/buyerMatcher');
const { sendBuyerBlast } = require('../utils/buyerBlast/emailBlast');
const DealBlast = require('../models/DealBlast');
const { getAvailableProviders } = require('../services/outboundProviders');

/**
 * GET /api/rapid-offer/closer/queue
 * Get closer queue with routing support
 */
exports.getQueue = async (req, res, next) => {
  try {
    const { filter } = req.query;
    const query = {
      'handoff.status': { $in: ['ready_for_closer', 'closer_review', 'offer_sent', 'contract_sent'] }
    };

    if (filter === 'hot') {
      // Hot Deals: immediate_closer route with urgent priority
      query['routing.route'] = 'immediate_closer';
      query['routing.priorityLevel'] = 'urgent';
    } else if (filter === 'new') {
      query['handoff.status'] = { $in: ['ready_for_closer', 'closer_review'] };
    } else if (filter === 'offer-sent') {
      query['handoff.status'] = 'offer_sent';
    } else if (filter === 'contract-sent') {
      query['handoff.status'] = 'contract_sent';
    }

    const priorityOrder = { 'urgent': 1, 'high': 2, 'normal': 3, 'low': 4 };
    query.tenantId = req.user.tenantId; // Tenant-scoped
    const leads = await Lead.find(query)
      .limit(200) // Get more to sort properly
      .select('ownerName propertyAddress handoff closer dialerIntake skipTrace skipTraceLocked leadScore routing createdAt updatedAt');

    // Sort by priority level, then by sentToCloserAt
    leads.sort((a, b) => {
      // First: Priority level (urgent > high > normal > low)
      const priorityA = a.routing?.priorityLevel || 'normal';
      const priorityB = b.routing?.priorityLevel || 'normal';
      const priorityOrderA = priorityOrder[priorityA] || 3;
      const priorityOrderB = priorityOrder[priorityB] || 3;
      if (priorityOrderA !== priorityOrderB) {
        return priorityOrderA - priorityOrderB;
      }
      
      // Second: Sent to closer time (newer first)
      const sentA = a.handoff?.sentToCloserAt || a.createdAt;
      const sentB = b.handoff?.sentToCloserAt || b.createdAt;
      return new Date(sentB) - new Date(sentA);
    });

    // Limit after sorting
    const limitedLeads = leads.slice(0, 100);

    // Add routing badge info for closer
    const leadsWithRouting = limitedLeads.map(lead => {
      const leadObj = lead.toObject();
      leadObj.routingBadge = {
        route: lead.routing?.route || null,
        priorityLevel: lead.routing?.priorityLevel || null,
        routingReasons: lead.routing?.routingReasons || [],
        routedAt: lead.routing?.routedAt || null,
        slaHours: lead.routing?.slaHours || null,
        buyBoxMatched: !!lead.leadScore?.buyBoxId
      };
      return leadObj;
    });

    res.json(leadsWithRouting);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/closer/leads/:id
 * Get lead with all data for closer review
 */
exports.getLead = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get templates for closer
    const templates = await Template.find({
      roleScope: { $in: ['closer', 'both'] },
      isActive: true
    }).select('key type title tags');

    // Full skip trace data for closer (including phones, emails, addresses)
    const skipTraceData = {
      status: lead.skipTrace?.status || 'not_requested',
      requestedAt: lead.skipTrace?.requestedAt,
      completedAt: lead.skipTrace?.completedAt,
      provider: lead.skipTrace?.provider,
      confidenceScore: lead.skipTrace?.confidenceScore,
      phones: lead.skipTrace?.phones || [],
      emails: lead.skipTrace?.emails || [],
      mailingAddresses: lead.skipTrace?.mailingAddresses || [],
      entityInfo: lead.skipTrace?.entityInfo || null,
      notes: lead.skipTrace?.notes,
      locked: lead.skipTraceLocked || false
    };

    // Full score breakdown for closer
    const scoreBreakdown = {
      score: lead.leadScore?.score || 0,
      grade: lead.leadScore?.grade || 'Dead',
      buyBoxKey: lead.leadScore?.buyBoxKey || null,
      buyBoxLabel: lead.leadScore?.buyBoxLabel || null,
      evaluatedAt: lead.leadScore?.evaluatedAt || null,
      reasons: lead.leadScore?.reasons || [],
      failedChecks: lead.leadScore?.failedChecks || [],
      override: lead.leadScore?.override || null,
      hasScore: !!lead.leadScore?.evaluatedAt
    };

    // Full routing breakdown for closer
    const routingBreakdown = {
      route: lead.routing?.route || null,
      priorityLevel: lead.routing?.priorityLevel || null,
      routingReasons: lead.routing?.routingReasons || [],
      routedAt: lead.routing?.routedAt || null,
      routedBy: lead.routing?.routedBy || null,
      slaHours: lead.routing?.slaHours || null,
      routingAlertedAt: lead.routing?.routingAlertedAt || null,
      override: lead.routing?.override || null
    };

    res.json({
      lead,
      templates,
      skipTraceData,
      scoreBreakdown,
      routingBreakdown
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/request-info
 * Request missing info from dialer (backflow)
 */
exports.requestInfo = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { requestedFields, note } = req.body;

    // Initialize handoff if it doesn't exist
    if (!lead.handoff) {
      lead.handoff = { status: 'none' };
    }

    // Update handoff status
    lead.handoff.status = 'back_to_dialer';
    lead.handoff.closerRequestedInfoAt = new Date();
    lead.handoff.closerRequestedInfoNote = note || '';
    lead.handoff.missingFields = requestedFields || [];

    // Unlock intake (closer can request info, which unlocks intake)
    if (lead.dialerIntake) {
      lead.dialerIntake.intakeLocked = false;
    }

    await lead.save();

    // Create follow-up event for dialer
    await KpiEvent.create({
      userId: req.user.id,
      role: 'closer',
      leadId: lead._id,
      eventType: 'followup_done',
      metadata: { requestedFields, note }
    });

    // Create notification for dialer
    try {
      const { notifyInfoRequested } = require('../services/notificationService');
      const dialerUserId = lead.handoff?.sentToCloserBy;
      if (dialerUserId) {
        await notifyInfoRequested(lead, dialerUserId, requestedFields);
      }
    } catch (notifErr) {
      console.error('Failed to create info request notification:', notifErr);
      // Don't fail the request
    }

    res.json(lead);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/offer
 * Set offer details (closer only)
 */
exports.setOffer = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Guardrail: Only closer can set these fields
    const closerData = {
      offerLaneFinal: req.body.offerLaneFinal,
      offerTermsSummary: req.body.offerTermsSummary,
      offerAmount: req.body.offerAmount,
      loiOptions: req.body.loiOptions || [],
      followupSchedule: req.body.followupSchedule,
      disposition: req.body.disposition
    };

    // Remove undefined fields
    Object.keys(closerData).forEach(key => {
      if (closerData[key] === undefined) {
        delete closerData[key];
      }
    });

    // Initialize closer object if it doesn't exist
    if (!lead.closer) {
      lead.closer = {};
    }
    lead.closer = {
      ...(lead.closer.toObject ? lead.closer.toObject() : lead.closer),
      ...closerData
    };

    // Auto-process cash buyer if offer lane is set to cash
    if (closerData.offerLaneFinal === 'cash') {
      try {
        const { processCashBuyerFromLead } = require('../services/buyerIntelligenceService');
        await processCashBuyerFromLead(lead);
      } catch (err) {
        console.error('Failed to process cash buyer:', err);
        // Don't fail the request if buyer processing fails
      }
    }

    // Track first closer action for A-grade leads (KPI tracking)
    if (lead.routing?.route === 'immediate_closer' && lead.leadScore?.grade === 'A') {
      // Check if this is the first action (no previous offer/contract sent)
      const isFirstAction = !lead.closer?.offerSentAt && !lead.closer?.contractSentAt;
      if (isFirstAction && (closerData.offerAmount || closerData.offerLaneFinal || closerData.offerTermsSummary)) {
        try {
          await KpiEvent.create({
            userId: req.user.id,
            role: 'closer',
            leadId: lead._id,
            eventType: 'closer_first_action',
            metadata: {
              route: lead.routing?.route,
              priorityLevel: lead.routing?.priorityLevel,
              score: lead.leadScore?.score,
              grade: lead.leadScore?.grade,
              timeSinceRouted: lead.routing?.routedAt 
                ? Math.round((new Date() - new Date(lead.routing.routedAt)) / (1000 * 60)) // minutes
                : null
            }
          });
        } catch (kpiErr) {
          console.error('Failed to log closer first action KPI:', kpiErr);
        }
      }
    }

    await lead.save();

    // Trigger CloserKPI update for closer actions (async)
    try {
      const { triggerCloserKPIUpdate } = require('../utils/closerKPIService');
      triggerCloserKPIUpdate(req.user.id);
    } catch (kpiErr) {
      console.error('Failed to trigger CloserKPI update:', kpiErr);
    }

    // Emit real-time event
    const { emitToTenant, emitToRole, emitToRoom } = require('../utils/realtime');
    if (lead.tenantId) {
      emitToTenant(lead.tenantId, 'lead:updated', { leadId: lead._id, lead });
      emitToRole('dialer', 'lead:updated', { leadId: lead._id, lead });
      emitToRoom(`lead:${lead._id}`, 'lead:updated', { leadId: lead._id, lead });
    }

    res.json(lead);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/override-score
 * Override lead score grade with reason (closer only)
 */
exports.overrideScore = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { grade, reason } = req.body;

    if (!grade || !['A', 'B', 'C', 'D', 'Dead'].includes(grade)) {
      return res.status(400).json({ error: 'Valid grade is required (A, B, C, D, Dead)' });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Reason is required for override' });
    }

    // Initialize leadScore if it doesn't exist
    if (!lead.leadScore) {
      lead.leadScore = {
        score: 0,
        grade: 'Dead',
        reasons: [],
        failedChecks: []
      };
    }

    // Store override
    lead.leadScore.override = {
      grade,
      reason: reason.trim(),
      overriddenBy: req.user.id,
      overriddenAt: new Date()
    };

    // Update grade (override takes precedence)
    lead.leadScore.grade = grade;

    await lead.save();

    // Trigger routing after grade override
    try {
      const { routeLead } = require('../services/dealRoutingService');
      await routeLead(lead, { skipActions: false, userId: req.user.id });
    } catch (routingErr) {
      console.error('Failed to route lead after grade override:', routingErr);
      // Don't fail the request if routing fails
    }

    // Log override for KPI tracking
    try {
      const KpiEvent = require('../models/KpiEvent');
      await KpiEvent.create({
        userId: req.user.id,
        role: 'closer',
        leadId: lead._id,
        eventType: 'score_override',
        metadata: {
          originalGrade: lead.leadScore.grade,
          overrideGrade: grade,
          reason: reason.trim(),
          score: lead.leadScore.score
        }
      });
    } catch (kpiErr) {
      console.error('Failed to log score override KPI:', kpiErr);
    }

    res.json({
      message: 'Score grade overridden',
      lead,
      leadScore: lead.leadScore
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/mark-offer-sent
 */
exports.markOfferSent = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Initialize handoff if needed
    if (!lead.handoff) {
      lead.handoff = { status: 'none' };
    }
    if (!lead.closer) {
      lead.closer = {};
    }

    lead.handoff.status = 'offer_sent';
    lead.closer.offerSentAt = new Date();
    lead.closer.disposition = 'negotiating';

    // Auto-process cash buyer if offer lane is cash
    if (lead.closer.offerLaneFinal === 'cash') {
      try {
        const { processCashBuyerFromLead } = require('../services/buyerIntelligenceService');
        await processCashBuyerFromLead(lead);
      } catch (err) {
        console.error('Failed to process cash buyer:', err);
      }
    }

    await lead.save();

    // Create KPI event
    await KpiEvent.create({
      userId: req.user.id,
      role: 'closer',
      leadId: lead._id,
      eventType: 'offer_sent'
    });

    // Create notification
    try {
      const { notifyOfferSent } = require('../services/notificationService');
      await notifyOfferSent(lead, req.user.id, lead.closer.offerAmount);
    } catch (notifErr) {
      console.error('Failed to create offer sent notification:', notifErr);
    }

    // Update CloserKPI (async)
    const { triggerCloserKPIUpdate } = require('../utils/closerKPIService');
    triggerCloserKPIUpdate(req.user.id);

    res.json(lead);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/mark-contract-sent
 */
exports.markContractSent = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Initialize handoff/closer if needed
    if (!lead.handoff) {
      lead.handoff = { status: 'none' };
    }
    if (!lead.closer) {
      lead.closer = {};
    }

    lead.handoff.status = 'contract_sent';
    lead.closer.contractSentAt = new Date();
    lead.closer.disposition = 'negotiating';

    await lead.save();

    // Create KPI event
    await KpiEvent.create({
      userId: req.user.id,
      role: 'closer',
      leadId: lead._id,
      eventType: 'contract_sent'
    });

    // Create notification
    try {
      const { notifyContractSent } = require('../services/notificationService');
      await notifyContractSent(lead, req.user.id);
    } catch (notifErr) {
      console.error('Failed to create contract sent notification:', notifErr);
    }

    // Update CloserKPI (async)
    const { triggerCloserKPIUpdate } = require('../utils/closerKPIService');
    triggerCloserKPIUpdate(req.user.id);

    res.json(lead);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/override-routing
 * Manually override routing (admin/manager only)
 */
exports.overrideRouting = async (req, res, next) => {
  try {
    // Only admin/manager can override routing
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Only admins and managers can override routing' });
    }

    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { route, priorityLevel, reason } = req.body;

    if (!route || !['immediate_closer', 'dialer_priority', 'nurture', 'archive'].includes(route)) {
      return res.status(400).json({ error: 'Valid route is required' });
    }

    if (!priorityLevel || !['urgent', 'high', 'normal', 'low'].includes(priorityLevel)) {
      return res.status(400).json({ error: 'Valid priority level is required' });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Reason is required for routing override' });
    }

    const { overrideRouting } = require('../services/dealRoutingService');
    const routingResult = await overrideRouting(lead, route, priorityLevel, reason, req.user.id);

    res.json({
      message: 'Routing overridden',
      lead,
      routing: routingResult
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/mark-under-contract
 */
exports.markUnderContract = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Initialize handoff/closer if needed
    if (!lead.handoff) {
      lead.handoff = { status: 'none' };
    }
    if (!lead.closer) {
      lead.closer = {};
    }

    lead.handoff.status = 'under_contract';
    lead.status = 'under_contract';
    lead.closer.underContractAt = new Date();
    lead.closer.disposition = 'contract_sent';

    // Auto-process cash buyer if offer lane is cash
    if (lead.closer.offerLaneFinal === 'cash') {
      try {
        const { processCashBuyerFromLead } = require('../services/buyerIntelligenceService');
        await processCashBuyerFromLead(lead);
      } catch (err) {
        console.error('Failed to process cash buyer:', err);
        // Don't fail the request if buyer processing fails
      }
    }

    await lead.save();

    // Create KPI event for contract signed
    try {
      await KpiEvent.create({
        userId: req.user.id,
        role: 'closer',
        leadId: lead._id,
        eventType: 'contract_signed'
      });

      // Update CloserKPI (async)
      const { triggerCloserKPIUpdate } = require('../utils/closerKPIService');
      triggerCloserKPIUpdate(req.user.id);
    } catch (kpiErr) {
      console.error('Failed to log contract signed KPI:', kpiErr);
    }

    res.json(lead);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/closer/leads/:id/buyer-matches
 * Preview buyer matches for a lead (closer workspace)
 */
exports.previewBuyerMatches = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { channel = 'internal' } = req.query;
    
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Get matches using buyer matching service
    const matches = await matchBuyersForLead(lead, { channel, maxResults: 50 });
    
    // Separate matched and excluded
    const matched = matches.filter(m => !m.excluded);
    const excluded = matches.filter(m => m.excluded);
    
    // Get recent blasts for this lead
    const DealBlast = require('../models/DealBlast');
    const recentBlasts = await DealBlast.find({ leadId: lead._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id channel status sentAt stats createdAt');
    
    res.json({
      lead: {
        _id: lead._id,
        propertyAddress: lead.propertyAddress || lead.dialerIntake?.propertyAddress,
        grade: lead.leadScore?.grade || 'Dead',
        score: lead.leadScore?.score || 0
      },
      matches: {
        matched: matched.map(m => ({
          buyerId: m.buyer._id,
          buyerName: m.buyer.name || m.buyer.entityName,
          score: m.score,
          reasons: m.reasons,
          preferences: {
            markets: m.buyer.preferredMarkets || m.buyer.markets,
            propertyTypes: m.buyer.propertyTypes,
            maxBuyPrice: m.buyer.maxBuyPrice,
            minArv: m.buyer.minArv,
            engagementScore: m.buyer.engagementScore
          }
        })),
        excluded: excluded.slice(0, 10).map(e => ({
          buyerId: e.buyer._id,
          buyerName: e.buyer.name || e.buyer.entityName,
          exclusionReason: e.exclusionReason
        }))
      },
      recentBlasts,
      availableProviders: getAvailableProviders()
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/closer/leads/:id/blasts
 * Get deal blasts for a lead
 */
exports.getLeadBlasts = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const DealBlast = require('../models/DealBlast');
    const DealBlastRecipient = require('../models/DealBlastRecipient');
    
    const blasts = await DealBlast.find({ leadId: id })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(20);
    
    // Get recipient counts for each blast
    const blastsWithStats = await Promise.all(
      blasts.map(async (blast) => {
        const recipients = await DealBlastRecipient.find({ dealBlastId: blast._id });
        return {
          ...blast.toObject(),
          recipientCount: recipients.length,
          responseCount: recipients.filter(r => r.status === 'interested' || r.status === 'replied').length
        };
      })
    );
    
    res.json(blastsWithStats);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/closer/leads/:id/matching-buyers
 * Get matching buyers for a lead (simplified version for closer workspace)
 */
exports.getMatchingBuyers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { threshold = 70 } = req.query;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get all active buyers
    const buyers = await Buyer.find({ active: true });

    // Match each buyer to the lead
    const matchedBuyers = buyers
      .map(buyer => {
        const matchResult = matchBuyerToLead(lead, buyer, parseFloat(threshold));
        return {
          buyer: {
            id: buyer._id,
            name: buyer.name,
            email: buyer.email || (buyer.emails && buyer.emails.length > 0 ? buyer.emails[0] : null),
            phone: buyer.phone || (buyer.phones && buyer.phones.length > 0 ? buyer.phones[0] : null),
            buyerType: buyer.buyerType,
            counties: buyer.counties,
            states: buyer.states,
            propertyTypes: buyer.propertyTypes,
            cashReady: buyer.cashReady,
            proofOfFunds: buyer.proofOfFunds,
            avgCloseDays: buyer.avgCloseDays
          },
          matchScore: matchResult.matchScore,
          matchReasons: matchResult.matchReasons,
          isMatch: matchResult.isMatch
        };
      })
      .filter(result => result.isMatch)
      .sort((a, b) => b.matchScore - a.matchScore);

    res.json({
      lead: {
        id: lead._id,
        propertyAddress: lead.propertyAddress || lead.dialerIntake?.propertyAddress,
        county: lead.county || lead.dialerIntake?.county,
        state: lead.state || lead.dialerIntake?.state,
        askingPrice: lead.askingPrice || lead.listPrice || lead.dialerIntake?.askingPrice
      },
      matchingBuyers: matchedBuyers,
      totalMatches: matchedBuyers.length,
      threshold: parseFloat(threshold)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/closer/leads/:id/send-buyer-blast
 * Send buyer blast email to matched buyers
 */
exports.sendBuyerBlast = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { buyerIds, maskAddress = false, includeFullDetails = true, subject } = req.body;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get buyers - either specified IDs or auto-match
    let buyers = [];
    if (buyerIds && buyerIds.length > 0) {
      buyers = await Buyer.find({ _id: { $in: buyerIds }, active: true });
    } else {
      // Auto-match buyers
      const allBuyers = await Buyer.find({ active: true });
      buyers = allBuyers
        .map(buyer => {
          const matchResult = matchBuyerToLead(lead, buyer, 70);
          return { buyer, matchResult };
        })
        .filter(({ matchResult }) => matchResult.isMatch)
        .sort((a, b) => b.matchResult.matchScore - a.matchResult.matchScore)
        .map(({ buyer }) => buyer);
    }

    if (buyers.length === 0) {
      return res.status(400).json({ error: 'No matching buyers found' });
    }

    // Send buyer blast
    const results = await sendBuyerBlast(lead, buyers, {
      maskAddress,
      includeFullDetails,
      subject
    });

    // Log blast event
    try {
      await KpiEvent.create({
        eventType: 'buyer_blast_sent',
        userId: userId,
        leadId: lead._id,
        metadata: {
          buyerCount: results.sent.length,
          failedCount: results.failed.length,
          maskAddress,
          channel: 'email'
        }
      });
    } catch (kpiErr) {
      console.error('Failed to log buyer blast KPI event:', kpiErr);
      // Don't fail the request if KPI logging fails
    }

    res.json({
      message: 'Buyer blast sent',
      results: {
        sent: results.sent.length,
        failed: results.failed.length,
        total: results.total
      },
      sent: results.sent,
      failed: results.failed
    });
  } catch (err) {
    next(err);
  }
};
