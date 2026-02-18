// controllers/rapidOfferDialerController.js
const Lead = require('../models/Lead');
const Template = require('../models/Template');
const KpiEvent = require('../models/KpiEvent');
const { classifyOfferLane } = require('../utils/offerLaneClassifier');
const { generateHandoffSummary } = require('../utils/handoffGenerator');
const { checkProhibitedPhrases } = require('../utils/complianceChecker');
const { recalculateAndSaveLeadScore } = require('../utils/leadScoringEngine');

/**
 * GET /api/rapid-offer/dialer/queue
 * Get dialer queue with filters
 */
exports.getQueue = async (req, res, next) => {
  try {
    const { filter } = req.query;
    const query = {};

    // Base filter: status = "new" OR leads with nextFollowUp set (follow-up leads), leadTier != "cold"
    query.$or = [
      { status: 'new' },
      { nextFollowUp: { $exists: true, $lte: new Date() } }
    ];
    query.leadTier = { $ne: 'cold' };

    // Additional filter logic
    switch (filter) {
      case 'new':
        query['dialerIntake.intakeCompletedAt'] = { $exists: false };
        query['handoff.status'] = { $in: ['none', 'back_to_dialer'] };
        break;
      case 'follow-up':
        query['nextFollowUp'] = { $lte: new Date() };
        query['handoff.status'] = { $in: ['none', 'back_to_dialer'] };
        break;
      case 'hot':
        query['dialerIntake.motivationRating'] = { $gte: 4 };
        query['handoff.status'] = { $in: ['none', 'back_to_dialer'] };
        break;
      case 'needs-missing-data':
        query['handoff.status'] = 'back_to_dialer';
        break;
      case 'escalated':
        query['handoff.status'] = 'ready_for_closer';
        break;
      default:
        // Default: new leads or leads back to dialer (already filtered by status and leadTier above)
        query.$or = [
          { 'dialerIntake.intakeCompletedAt': { $exists: false } },
          { 'handoff.status': 'back_to_dialer' }
        ];
    }

    // Build sort criteria: Priority level → Route → Grade → Score → UpdatedAt
    const priorityOrder = { 'urgent': 1, 'high': 2, 'normal': 3, 'low': 4 };
    const routeOrder = { 'immediate_closer': 1, 'dialer_priority': 2, 'nurture': 3, 'archive': 4 };
    const gradeOrder = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'Dead': 5 };
    query.tenantId = req.user.tenantId; // Tenant-scoped
    const leads = await Lead.find(query)
      .limit(200) // Get more to sort properly
      .select('ownerName propertyAddress status dialerIntake handoff skipTrace skipTraceLocked leadScore routing createdAt updatedAt');

    // Sort by priority level, then route, then grade, then score, then updatedAt
    leads.sort((a, b) => {
      // First: Priority level (urgent > high > normal > low)
      const priorityA = a.routing?.priorityLevel || 'normal';
      const priorityB = b.routing?.priorityLevel || 'normal';
      const priorityOrderA = priorityOrder[priorityA] || 3;
      const priorityOrderB = priorityOrder[priorityB] || 3;
      if (priorityOrderA !== priorityOrderB) {
        return priorityOrderA - priorityOrderB; // Lower number = higher priority
      }
      
      // Second: Route (immediate_closer > dialer_priority > nurture > archive)
      const routeA = a.routing?.route || 'nurture';
      const routeB = b.routing?.route || 'nurture';
      const routeOrderA = routeOrder[routeA] || 3;
      const routeOrderB = routeOrder[routeB] || 3;
      if (routeOrderA !== routeOrderB) {
        return routeOrderA - routeOrderB;
      }
      
      // Third: Grade (A > B > C > D > Dead)
      const gradeA = a.leadScore?.grade || 'Dead';
      const gradeB = b.leadScore?.grade || 'Dead';
      const orderA = gradeOrder[gradeA] || 5;
      const orderB = gradeOrder[gradeB] || 5;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Fourth: Score (higher first)
      const scoreA = a.leadScore?.score || 0;
      const scoreB = b.leadScore?.score || 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      
      // Fifth: UpdatedAt (newer first)
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    // Limit after sorting
    const limitedLeads = leads.slice(0, 100);

    // Add skip trace status badge info, score info, and routing badges for dialers
    const leadsWithStatus = limitedLeads.map(lead => {
      const leadObj = lead.toObject();
      leadObj.skipTraceStatus = lead.skipTrace?.status || 'not_requested';
      leadObj.skipTracePhonesCount = lead.skipTrace?.phones?.length || 0;
      leadObj.skipTraceEmailsCount = lead.skipTrace?.emails?.length || 0;
      
      // Add score badge info (dialers can see score/grade but not override)
      leadObj.scoreBadge = {
        score: lead.leadScore?.score || 0,
        grade: lead.leadScore?.grade || 'Dead',
        hasScore: !!lead.leadScore?.evaluatedAt
      };
      
      // Add routing badge info
      leadObj.routingBadge = {
        route: lead.routing?.route || null,
        priorityLevel: lead.routing?.priorityLevel || null,
        routingReasons: lead.routing?.routingReasons || [],
        routedAt: lead.routing?.routedAt || null,
        slaHours: lead.routing?.slaHours || null
      };
      
      // Don't expose actual skip trace data to dialers
      return leadObj;
    });

    res.json(leadsWithStatus);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/dialer/leads/:id
 * Get lead with intake data and available templates
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

    // Get templates for dialer (tenant-scoped)
    const templates = await Template.find({
      tenantId: req.user.tenantId,
      roleScope: { $in: ['dialer', 'both'] },
      isActive: true
    }).select('key type title tags');

    // Compliance banner data
    const complianceData = {
      recordingDisclosureGiven: lead.dialerIntake?.recordingDisclosureGiven || false,
      offshoreModeUsed: lead.dialerIntake?.offshoreModeUsed || false
    };

    // Skip trace status for dialers (limited visibility)
    const skipTraceStatus = {
      status: lead.skipTrace?.status || 'not_requested',
      confidenceScore: lead.skipTrace?.confidenceScore || null,
      phonesCount: lead.skipTrace?.phones?.length || 0,
      emailsCount: lead.skipTrace?.emails?.length || 0,
      // Don't expose actual phone/email numbers to dialers
      hasData: (lead.skipTrace?.phones?.length || 0) > 0 || (lead.skipTrace?.emails?.length || 0) > 0
    };

    res.json({
      lead,
      templates,
      complianceData,
      skipTraceStatus
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/dialer/leads/:id/intake
 * Create/update intake (dialer only, respects locks)
 */
exports.updateIntake = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if intake is locked
    if (lead.dialerIntake?.intakeLocked) {
      return res.status(403).json({ error: 'Intake is locked. Cannot edit.' });
    }

    // Guardrail: Dialer cannot set closer fields
    const forbiddenFields = ['offerAmount', 'offerSent', 'contractSent', 'underContract', 'offerLaneFinal'];
    const hasForbiddenFields = Object.keys(req.body).some(key => 
      forbiddenFields.includes(key) || key.startsWith('closer.')
    );
    if (hasForbiddenFields) {
      return res.status(403).json({ error: 'Dialers cannot set closer fields' });
    }

    // Guardrail: Reject if attempting to set offerAmount anywhere
    if (req.body.offerAmount !== undefined) {
      return res.status(403).json({ error: 'Dialers cannot enter offer amounts' });
    }

    // Compliance check: Check notes for prohibited phrases
    if (req.body.notes || lead.notes) {
      const notesToCheck = req.body.notes || lead.notes || '';
      const complianceCheck = checkProhibitedPhrases(notesToCheck);
      if (complianceCheck.hasViolations) {
        // Log violation but allow (or reject based on policy)
        await KpiEvent.create({
          userId: req.user.id,
          role: 'dialer',
          leadId: lead._id,
          eventType: 'compliance_violation',
          metadata: { violations: complianceCheck.violations, text: notesToCheck }
        });
      }
    }

    // Update intake data
    const intakeData = { ...req.body };
    
    // If offshore mode is enabled, ensure script selection is enforced
    if (intakeData.offshoreModeUsed && req.body.pitchText) {
      return res.status(400).json({ error: 'Offshore mode requires script selection only. Free-form pitch not allowed.' });
    }

    // Classify offer lane if we have enough data
    if (intakeData.mortgageFreeAndClear && intakeData.sellerFlexibility && intakeData.motivationRating) {
      const classification = classifyOfferLane(intakeData);
      intakeData.recommendedOfferLane = classification.suggestion;
    }

    // Mark as completed if all required fields are present
    const requiredFields = [
      'propertyAddress',
      'occupancyType',
      'conditionTier',
      'mortgageFreeAndClear',
      'mortgageCurrent',
      'motivationRating',
      'timelineToClose',
      'sellerReason',
      'sellerFlexibility'
    ];

    const hasAllRequired = requiredFields.every(field => {
      const value = intakeData[field];
      return value && value !== 'unknown' && value !== '';
    });

    if (hasAllRequired && !lead.dialerIntake?.intakeCompletedAt) {
      intakeData.intakeCompletedAt = new Date();
      
      // Create KPI event
      await KpiEvent.create({
        userId: req.user.id,
        role: 'dialer',
        leadId: lead._id,
        eventType: 'intake_completed'
      });
    }

    // Update lead (initialize dialerIntake if it doesn't exist)
    if (!lead.dialerIntake) {
      lead.dialerIntake = {};
    }
    lead.dialerIntake = {
      ...lead.dialerIntake.toObject ? lead.dialerIntake.toObject() : lead.dialerIntake,
      ...intakeData
    };
    await lead.save();

    // Recalculate lead score after intake update (this will also trigger routing)
    try {
      await recalculateAndSaveLeadScore(lead);
    } catch (scoreErr) {
      console.error('Failed to recalculate lead score:', scoreErr);
      // Don't fail the request if scoring fails
    }

    // Explicitly trigger routing if intake was just completed
    if (hasAllRequired && !lead.dialerIntake?.intakeCompletedAt) {
      try {
        const { routeLead } = require('../services/dealRoutingService');
        const updatedLead = await Lead.findOne({ 
          _id: req.params.id,
          tenantId: req.user.tenantId 
        });
        await routeLead(updatedLead, { skipActions: false, userId: req.user.id });
      } catch (routingErr) {
        console.error('Failed to route lead after intake completion:', routingErr);
        // Don't fail the request if routing fails
      }
    }

    // Reload lead to get updated score and routing (tenant-scoped)
    const updatedLead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    
    if (!updatedLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Emit real-time event
    const { emitToTenant, emitToRole, emitToRoom } = require('../utils/realtime');
    if (updatedLead.tenantId) {
      emitToTenant(updatedLead.tenantId, 'lead:updated', { leadId: updatedLead._id, lead: updatedLead });
      emitToRole('closer', 'lead:updated', { leadId: updatedLead._id, lead: updatedLead });
      emitToRoom(`lead:${updatedLead._id}`, 'lead:updated', { leadId: updatedLead._id, lead: updatedLead });
    }
    
    res.json(updatedLead);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/dialer/leads/:id/send-to-closer
 * Send lead to closer with handoff summary
 */
exports.sendToCloser = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id,
      tenantId: req.user.tenantId 
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if intake is completed
    if (!lead.dialerIntake?.intakeCompletedAt) {
      // Allow escalation even without complete intake
      const { escalate } = req.body;
      if (!escalate || escalate !== 'high_priority') {
        return res.status(400).json({ 
          error: 'Intake not completed. Complete intake or use escalate: "high_priority" to send anyway.' 
        });
      }
    }

    // Generate handoff summary
    const { summary, missingFields } = generateHandoffSummary(lead, lead.dialerIntake || {});

    // Update handoff status
    lead.handoff = {
      status: 'closer_review',
      handoffSummary: summary,
      missingFields,
      sentToCloserAt: new Date(),
      sentToCloserBy: req.user.id
    };

    // Lock intake
    if (!lead.dialerIntake) {
      lead.dialerIntake = {};
    }
    lead.dialerIntake.intakeLocked = true;

    await lead.save();

    // Create KPI event
    await KpiEvent.create({
      userId: req.user.id,
      role: 'dialer',
      leadId: lead._id,
      eventType: 'handoff_sent',
      metadata: { missingFields }
    });

    // Create notification for closer (find closer users - simplified: notify all closers for now)
    try {
      const User = require('../models/user');
      const { notifyHandoffReceived } = require('../services/notificationService');
      const closerUsers = await User.find({ 
        tenantId: req.user.tenantId,
        role: { $in: ['closer', 'manager', 'admin'] } 
      });
      for (const closerUser of closerUsers) {
        await notifyHandoffReceived(lead, closerUser._id, req.user.id);
      }
    } catch (notifErr) {
      console.error('Failed to create handoff notification:', notifErr);
      // Don't fail the request
    }

    // Emit real-time events
    const { emitToTenant, emitToRole, emitToRoom } = require('../utils/realtime');
    if (lead.tenantId) {
      emitToTenant(lead.tenantId, 'handoff:created', { 
        leadId: lead._id, 
        lead,
        handoffSummary: summary,
        missingFields
      });
      emitToRole('closer', 'handoff:created', { 
        leadId: lead._id, 
        lead,
        handoffSummary: summary,
        missingFields
      });
      emitToRoom(`lead:${lead._id}`, 'handoff:created', { 
        leadId: lead._id, 
        lead,
        handoffSummary: summary,
        missingFields
      });
    }

    res.json({
      lead,
      handoffSummary: summary,
      missingFields
    });
  } catch (err) {
    next(err);
  }
};
