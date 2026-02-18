// controllers/kpiController.js
const KpiEvent = require('../models/KpiEvent');
const ScorecardWeekly = require('../models/ScorecardWeekly');
const CloserKPI = require('../models/CloserKPI');
const Lead = require('../models/Lead');
const BuyerFeedback = require('../models/BuyerFeedback');
const { getWeekStart } = require('../utils/closerKPIService');

/**
 * Calculate weekly scorecard for a user
 */
async function calculateWeeklyScorecard(userId, role, weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Get all events for this week
  const events = await KpiEvent.find({
    userId,
    role,
    createdAt: { $gte: weekStart, $lt: weekEnd }
  });

  // Activity metrics
  const callsMade = events.filter(e => e.eventType === 'call_made').length;
  const conversations = events.filter(e => e.eventType === 'conversation').length;
  const intakesCompleted = events.filter(e => e.eventType === 'intake_completed').length;
  const handoffsSent = events.filter(e => e.eventType === 'handoff_sent').length;
  const complianceViolations = events.filter(e => e.eventType === 'compliance_violation').length;

  // Calculate scorecard components (100-point system)
  let intakeAccuracy = 0; // 30 points - based on intake completion rate and quality
  let callControl = 0; // 20 points - based on conversation quality
  let scriptAdherence = 0; // 20 points - based on template usage
  let compliance = 0; // 20 points - based on violations
  let professionalism = 0; // 10 points - manager input or default

  // Intake Accuracy (30 points)
  // If 80%+ of conversations result in completed intakes, give full points
  if (conversations > 0) {
    const completionRate = intakesCompleted / conversations;
    intakeAccuracy = Math.min(30, completionRate * 30);
  }

  // Call Control (20 points)
  // Based on conversation-to-call ratio (higher is better)
  if (callsMade > 0) {
    const conversationRate = conversations / callsMade;
    callControl = Math.min(20, conversationRate * 20);
  }

  // Script Adherence (20 points)
  // Default to 15 if no violations, reduce based on violations
  scriptAdherence = 15; // Base score
  // Could be enhanced with template usage tracking

  // Compliance (20 points)
  // Start at 20, deduct 5 points per violation
  compliance = Math.max(0, 20 - (complianceViolations * 5));

  // Professionalism (10 points)
  // Default to 8, can be overridden by manager
  professionalism = 8;

  const totalScore = intakeAccuracy + callControl + scriptAdherence + compliance + professionalism;

  // Determine certification status
  let certificationStatus = 'conditional';
  if (totalScore >= 85) {
    certificationStatus = 'certified';
  } else if (totalScore < 60) {
    certificationStatus = 'retraining_required';
  }

  return {
    intakeAccuracy: Math.round(intakeAccuracy),
    callControl: Math.round(callControl),
    scriptAdherence: Math.round(scriptAdherence),
    compliance: Math.round(compliance),
    professionalism: Math.round(professionalism),
    totalScore: Math.round(totalScore),
    certificationStatus,
    callsMade,
    conversations,
    intakesCompleted,
    handoffsSent,
    complianceViolations
  };
}

/**
 * GET /api/rapid-offer/kpi/dialer/weekly
 */
exports.getDialerWeekly = async (req, res, next) => {
  try {
    const { weekStart, userId } = req.query;
    
    // Default to current week if not provided
    let startDate = weekStart ? new Date(weekStart) : new Date();
    if (weekStart) {
      startDate = new Date(weekStart);
    } else {
      // Start of current week (Monday)
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(startDate.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    }

    const targetUserId = userId || req.user.id;
    const role = 'dialer';

    // Check if scorecard already exists
    let scorecard = await ScorecardWeekly.findOne({
      userId: targetUserId,
      role,
      weekStart: startDate
    });

    if (!scorecard) {
      // Calculate and create
      const metrics = await calculateWeeklyScorecard(targetUserId, role, startDate);
      const weekEnd = new Date(startDate);
      weekEnd.setDate(weekEnd.getDate() + 7);

      scorecard = await ScorecardWeekly.create({
        userId: targetUserId,
        role,
        weekStart: startDate,
        weekEnd,
        ...metrics
      });
    }

    res.json(scorecard);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/kpi/offshore/weekly
 */
exports.getOffshoreWeekly = async (req, res, next) => {
  try {
    const { weekStart, userId } = req.query;
    
    let startDate = weekStart ? new Date(weekStart) : new Date();
    if (!weekStart) {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(startDate.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    }

    const targetUserId = userId || req.user.id;
    const role = 'dialer';

    // Get events where offshore mode was used
    const weekEnd = new Date(startDate);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const events = await KpiEvent.find({
      userId: targetUserId,
      role,
      createdAt: { $gte: startDate, $lt: weekEnd },
      'metadata.offshoreMode': true
    });

    const metrics = {
      callsMade: events.filter(e => e.eventType === 'call_made').length,
      conversations: events.filter(e => e.eventType === 'conversation').length,
      intakesCompleted: events.filter(e => e.eventType === 'intake_completed').length,
      complianceViolations: events.filter(e => e.eventType === 'compliance_violation').length
    };

    res.json({
      weekStart: startDate,
      weekEnd,
      ...metrics
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/kpi/closer/pipeline
 */
exports.getCloserPipeline = async (req, res, next) => {
  try {
    const pipeline = {
      inReview: 0,
      offerSent: 0,
      contractSent: 0,
      underContract: 0,
      totalValue: 0
    };

    const leads = await Lead.find({
      'handoff.status': { $in: ['closer_review', 'offer_sent', 'contract_sent', 'under_contract'] }
    }).select('handoff closer');

    leads.forEach(lead => {
      const status = lead.handoff?.status;
      if (status === 'closer_review') pipeline.inReview++;
      if (status === 'offer_sent') pipeline.offerSent++;
      if (status === 'contract_sent') pipeline.contractSent++;
      if (status === 'under_contract') pipeline.underContract++;

      if (lead.closer?.offerAmount) {
        pipeline.totalValue += lead.closer.offerAmount;
      }
    });

    res.json(pipeline);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rapid-offer/kpi/event
 * Log a KPI event (for dialer/closer actions)
 */
exports.logEvent = async (req, res, next) => {
  try {
    const { eventType, leadId, metadata } = req.body;
    
    // Validate eventType
    const validEventTypes = [
      'call_made',
      'conversation',
      'intake_completed',
      'handoff_sent',
      'followup_done',
      'offer_sent',
      'contract_sent',
      'compliance_violation'
    ];
    
    if (!validEventTypes.includes(eventType)) {
      return res.status(400).json({ error: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}` });
    }
    
    // Determine role from user (default to user's role if not specified)
    const role = req.user.role === 'closer' ? 'closer' : 'dialer';
    
    // Create event
    const event = await KpiEvent.create({
      userId: req.user.id,
      role,
      leadId: leadId || null,
      eventType,
      metadata: metadata || {}
    });
    
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/kpi/closers
 * Get closer KPIs (read-only, filtered by role)
 * Query params: weekStart, userId
 */
exports.getCloserKPIs = async (req, res, next) => {
  try {
    // Only admins and managers can view all closers, closers can only view their own
    const targetUserId = req.query.userId || req.user.id;
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && targetUserId !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Unauthorized: Cannot view other closers KPIs' });
    }

    let weekStart = req.query.weekStart ? new Date(req.query.weekStart) : getWeekStart();
    weekStart.setHours(0, 0, 0, 0);

    // Get or calculate KPI for the week
    let kpi = await CloserKPI.findOne({ userId: targetUserId, weekStartDate: weekStart });

    if (!kpi) {
      // Calculate on the fly
      const { updateCloserKPI } = require('../utils/closerKPIService');
      kpi = await updateCloserKPI(targetUserId, weekStart);
    }

    if (!kpi) {
      // Create empty record if no data exists
      const { getWeekEnd } = require('../utils/closerKPIService');
      const weekEnd = getWeekEnd(weekStart);
      kpi = await CloserKPI.create({
        userId: targetUserId,
        weekStartDate: weekStart,
        weekEndDate: weekEnd
      });
    }

    res.json(kpi);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/kpi/leads/:id/pricing
 * Get pricing intelligence for a lead (read-only)
 */
exports.getLeadPricingIntelligence = async (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findById(id).select('buyerInterestScore suggestedPriceRange lastPriceDiscoveryAt askingPrice listPrice');

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get feedback stats
    const feedback = await BuyerFeedback.find({ leadId: id });
    const stats = {
      total: feedback.length,
      interested: feedback.filter(f => f.responseType === 'interested').length,
      pass: feedback.filter(f => f.responseType === 'pass').length,
      price_too_high: feedback.filter(f => f.responseType === 'price_too_high').length,
      needs_more_info: feedback.filter(f => f.responseType === 'needs_more_info').length,
      wrong_market: feedback.filter(f => f.responseType === 'wrong_market').length
    };

    // Calculate confidence indicator (0-100)
    // Based on number of feedback points and consistency
    let confidence = 0;
    if (feedback.length >= 5) {
      confidence = 80; // High confidence with 5+ responses
    } else if (feedback.length >= 3) {
      confidence = 60; // Medium confidence with 3-4 responses
    } else if (feedback.length >= 1) {
      confidence = 40; // Low confidence with 1-2 responses
    }

    // Increase confidence if feedback is consistent (similar response types)
    if (feedback.length > 0) {
      const responseTypeCounts = {};
      feedback.forEach(f => {
        responseTypeCounts[f.responseType] = (responseTypeCounts[f.responseType] || 0) + 1;
      });
      const maxCount = Math.max(...Object.values(responseTypeCounts));
      const consistency = maxCount / feedback.length;
      confidence = Math.min(100, confidence + (consistency * 20)); // Boost confidence by up to 20 points
    }

    res.json({
      leadId: lead._id,
      buyerInterestScore: lead.buyerInterestScore,
      suggestedPriceRange: lead.suggestedPriceRange,
      lastPriceDiscoveryAt: lead.lastPriceDiscoveryAt,
      currentPrice: lead.askingPrice || lead.listPrice,
      feedbackStats: stats,
      confidence: Math.round(confidence)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/rapid-offer/kpi/scorecard/:id
 * Manager override for scorecard
 */
exports.updateScorecard = async (req, res, next) => {
  try {
    // Only manager/admin can update
    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only managers can update scorecards' });
    }

    const scorecard = await ScorecardWeekly.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        managerNotes: req.body.managerNotes,
        managerOverrideScore: req.body.managerOverrideScore
      },
      { new: true }
    );

    if (!scorecard) {
      return res.status(404).json({ error: 'Scorecard not found' });
    }

    res.json(scorecard);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rapid-offer/kpi/routing/performance
 * Get routing performance metrics
 */
exports.getRoutingPerformance = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get all routing events
    const routingEvents = await KpiEvent.find({
      eventType: { $in: ['lead_routed', 'routing_override', 'closer_first_action'] },
      createdAt: { $gte: start, $lte: end }
    }).populate('userId', 'name email').populate('leadId');
    
    // Get A-grade leads routed to immediate_closer
    const aGradeLeads = await Lead.find({
      'routing.route': 'immediate_closer',
      'routing.routedAt': { $gte: start, $lte: end },
      'leadScore.grade': 'A'
    }).select('routing leadScore handoff closer');
    
    // Calculate time_to_first_closer_action for A-grade leads
    const aGradeMetrics = aGradeLeads.map(lead => {
      const routedAt = lead.routing?.routedAt;
      const firstActionAt = lead.closer?.offerSentAt || 
                           lead.closer?.contractSentAt || 
                           lead.handoff?.sentToCloserAt;
      
      if (routedAt && firstActionAt) {
        const timeDiff = new Date(firstActionAt) - new Date(routedAt);
        return {
          leadId: lead._id,
          timeToFirstAction: Math.round(timeDiff / (1000 * 60)), // minutes
          slaHours: lead.routing?.slaHours || 2,
          withinSla: timeDiff <= (lead.routing?.slaHours || 2) * 60 * 60 * 1000
        };
      }
      return {
        leadId: lead._id,
        timeToFirstAction: null,
        slaHours: lead.routing?.slaHours || 2,
        withinSla: false,
        noAction: true
      };
    });
    
    // Get B-grade leads for dialer SLA compliance
    const bGradeLeads = await Lead.find({
      'routing.route': 'dialer_priority',
      'routing.routedAt': { $gte: start, $lte: end },
      'leadScore.grade': 'B'
    }).select('routing dialerIntake handoff');
    
    const bGradeMetrics = bGradeLeads.map(lead => {
      const routedAt = lead.routing?.routedAt;
      const intakeCompletedAt = lead.dialerIntake?.intakeCompletedAt;
      const slaHours = lead.routing?.slaHours || 24;
      
      if (routedAt && intakeCompletedAt) {
        const timeDiff = new Date(intakeCompletedAt) - new Date(routedAt);
        return {
          leadId: lead._id,
          timeToIntake: Math.round(timeDiff / (1000 * 60)), // minutes
          slaHours,
          withinSla: timeDiff <= slaHours * 60 * 60 * 1000
        };
      }
      return {
        leadId: lead._id,
        timeToIntake: null,
        slaHours,
        withinSla: false,
        noIntake: true
      };
    });
    
    // Count routing overrides by user
    const overrideEvents = routingEvents.filter(e => e.eventType === 'routing_override');
    const overrideCounts = {};
    overrideEvents.forEach(event => {
      const userId = event.userId?._id?.toString() || 'system';
      overrideCounts[userId] = (overrideCounts[userId] || 0) + 1;
    });
    
    // Calculate summary metrics
    const aGradeWithAction = aGradeMetrics.filter(m => !m.noAction);
    const aGradeAvgTime = aGradeWithAction.length > 0
      ? aGradeWithAction.reduce((sum, m) => sum + (m.timeToFirstAction || 0), 0) / aGradeWithAction.length
      : 0;
    const aGradeSlaCompliance = aGradeWithAction.length > 0
      ? (aGradeWithAction.filter(m => m.withinSla).length / aGradeWithAction.length) * 100
      : 0;
    const aGradeMissed = aGradeMetrics.filter(m => m.noAction).length;
    
    const bGradeWithIntake = bGradeMetrics.filter(m => !m.noIntake);
    const bGradeAvgTime = bGradeWithIntake.length > 0
      ? bGradeWithIntake.reduce((sum, m) => sum + (m.timeToIntake || 0), 0) / bGradeWithIntake.length
      : 0;
    const bGradeSlaCompliance = bGradeWithIntake.length > 0
      ? (bGradeWithIntake.filter(m => m.withinSla).length / bGradeWithIntake.length) * 100
      : 0;
    
    res.json({
      period: { start, end },
      aGrade: {
        total: aGradeLeads.length,
        withAction: aGradeWithAction.length,
        missed: aGradeMissed,
        avgTimeToFirstAction: Math.round(aGradeAvgTime), // minutes
        slaCompliance: Math.round(aGradeSlaCompliance), // percentage
        details: aGradeMetrics
      },
      bGrade: {
        total: bGradeLeads.length,
        withIntake: bGradeWithIntake.length,
        avgTimeToIntake: Math.round(bGradeAvgTime), // minutes
        slaCompliance: Math.round(bGradeSlaCompliance), // percentage
        details: bGradeMetrics
      },
      routingOverrides: {
        total: overrideEvents.length,
        byUser: overrideCounts
      },
      routingEvents: routingEvents.length
    });
  } catch (err) {
    next(err);
  }
};
