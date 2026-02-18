// services/dealRoutingService.js
// Automated Deal Routing based on Lead Score, Buy Box match, and market rules

const Lead = require('../models/Lead');
const { getRoutingConfig } = require('../config/routingConfig');

/**
 * Route a lead based on score, buy box match, and market rules
 * @param {Object} lead - Lead document with leadScore, buyBox, market, skipTrace
 * @param {Object} options - Options { skipActions: boolean, userId: ObjectId }
 * @returns {Promise<Object>} Routing result
 */
async function routeLead(lead, options = {}) {
  const config = await getRoutingConfig();
  const routingResult = determineRoute(lead, config);
  
  // Apply routing actions unless skipped
  if (!options.skipActions) {
    await applyRoutingActions(lead, routingResult, options.userId);
  }
  
  return routingResult;
}

/**
 * Determine route for a lead based on score and rules
 * @param {Object} lead - Lead document
 * @param {Object} config - Routing configuration
 * @returns {Object} Routing result
 */
function determineRoute(lead, config) {
  const score = lead.leadScore?.score || 0;
  const grade = lead.leadScore?.grade || 'Dead';
  const buyBoxMatched = !!lead.leadScore?.buyBoxId;
  const reasons = [];
  
  // Get grade thresholds from config
  const thresholds = config.gradeThresholds || {
    A: { min: 85, max: 100 },
    B: { min: 70, max: 84 },
    C: { min: 50, max: 69 },
    D: { min: 30, max: 49 },
    Dead: { min: 0, max: 29 }
  };
  
  // Check for major exclusions
  const hasMajorExclusions = checkMajorExclusions(lead, config);
  
  // Check cash flow requirements (for buy_hold and commercial strategies)
  const cashFlow = lead.leadScore?.cashFlow;
  const cashFlowPass = cashFlow?.cashFlowPass !== false; // Default to true if not calculated
  const dscrPass = cashFlow?.dscrPass !== false; // Default to true if not calculated
  const cashFlowRequired = cashFlow !== null && cashFlow !== undefined; // Cash flow was calculated
  
  // CASH FLOW ENFORCEMENT: Block immediate_closer routing if cash flow fails
  const cashFlowBlocked = cashFlowRequired && (!cashFlowPass || !dscrPass);
  
  // A-GRADE (85-100): immediate_closer
  if (grade === 'A' && score >= thresholds.A.min && score <= thresholds.A.max) {
    // Block routing to immediate_closer if cash flow fails
    if (cashFlowBlocked) {
      reasons.push(`A-grade lead (score: ${score})`);
      reasons.push('Buy Box matched');
      if (!cashFlowPass) {
        reasons.push('Failed cash flow rule: Monthly cash flow is not positive');
      }
      if (!dscrPass) {
        reasons.push(`Failed DSCR rule: DSCR ${cashFlow.dscr?.toFixed(2) || 'N/A'} below threshold`);
      }
      reasons.push('Routing to review/nurture instead of immediate_closer');
      
      return {
        route: 'nurture', // Route to nurture instead of immediate_closer
        priorityLevel: 'normal',
        reasons,
        slaHours: config.slaHours?.C || 72, // Use C-grade SLA
        shouldAlert: false,
        shouldLockIntake: false,
        shouldCreateCloserTask: false,
        routingReason: cashFlowPass ? 'DSCR below threshold' : 'Failed cash flow rule'
      };
    }
    
    if (buyBoxMatched && !hasMajorExclusions) {
      reasons.push(`A-grade lead (score: ${score})`);
      reasons.push('Buy Box matched');
      reasons.push('No major exclusions');
      if (cashFlowRequired && cashFlowPass && dscrPass) {
        reasons.push('Cash flow requirement passed');
      }
      
      return {
        route: 'immediate_closer',
        priorityLevel: 'urgent',
        reasons,
        slaHours: config.slaHours?.A || 2, // 2 hours default for A-grade
        shouldAlert: true,
        shouldLockIntake: true,
        shouldCreateCloserTask: true
      };
    } else {
      // A-grade but missing buy box or has exclusions - still route to closer but with notes
      reasons.push(`A-grade lead (score: ${score})`);
      if (!buyBoxMatched) reasons.push('Warning: Buy Box not matched');
      if (hasMajorExclusions) reasons.push('Warning: Major exclusions detected');
      
      return {
        route: 'immediate_closer',
        priorityLevel: 'urgent',
        reasons,
        slaHours: config.slaHours?.A || 2,
        shouldAlert: true,
        shouldLockIntake: true,
        shouldCreateCloserTask: true
      };
    }
  }
  
  // B-GRADE (70-84): dialer_priority
  if (grade === 'B' && score >= thresholds.B.min && score <= thresholds.B.max) {
    // Check if cash flow blocks routing (shouldn't happen for B-grade due to scoring enforcement, but double-check)
    if (cashFlowBlocked) {
      reasons.push(`B-grade lead (score: ${score})`);
      reasons.push('Failed cash flow rule - routing to nurture instead');
      if (!cashFlowPass) reasons.push('Monthly cash flow is not positive');
      if (!dscrPass) reasons.push(`DSCR ${cashFlow.dscr?.toFixed(2) || 'N/A'} below threshold`);
      
      return {
        route: 'nurture',
        priorityLevel: 'normal',
        reasons,
        slaHours: config.slaHours?.C || 72,
        shouldAlert: false,
        shouldLockIntake: false,
        shouldCreateCloserTask: false,
        routingReason: cashFlowPass ? 'DSCR below threshold' : 'Failed cash flow rule'
      };
    }
    
    reasons.push(`B-grade lead (score: ${score})`);
    reasons.push('High potential - prioritize in dialer queue');
    
    return {
      route: 'dialer_priority',
      priorityLevel: 'high',
      reasons,
      slaHours: config.slaHours?.B || 24, // 24 hours default for B-grade
      shouldAlert: false,
      shouldLockIntake: false,
      shouldCreateCloserTask: false
    };
  }
  
  // C-GRADE (50-69): nurture
  if (grade === 'C' && score >= thresholds.C.min && score <= thresholds.C.max) {
    reasons.push(`C-grade lead (score: ${score})`);
    reasons.push('Moderate potential - add to nurture queue');
    
    return {
      route: 'nurture',
      priorityLevel: 'normal',
      reasons,
      slaHours: config.slaHours?.C || 72, // 72 hours default for C-grade
      shouldAlert: false,
      shouldLockIntake: false,
      shouldCreateCloserTask: false
    };
  }
  
  // D-GRADE or DEAD (<50): archive
  if (grade === 'D' || grade === 'Dead' || score < thresholds.C.min) {
    reasons.push(`${grade}-grade lead (score: ${score})`);
    reasons.push('Low score - archive for future marketing');
    
    return {
      route: 'archive',
      priorityLevel: 'low',
      reasons,
      slaHours: null, // No SLA for archived leads
      shouldAlert: false,
      shouldLockIntake: false,
      shouldCreateCloserTask: false
    };
  }
  
  // Fallback: default to nurture
  reasons.push(`Unclassified lead (score: ${score}, grade: ${grade})`);
  return {
    route: 'nurture',
    priorityLevel: 'normal',
    reasons,
    slaHours: config.slaHours?.C || 72,
    shouldAlert: false,
    shouldLockIntake: false,
    shouldCreateCloserTask: false
  };
}

/**
 * Check for major exclusions that would prevent immediate closer routing
 * @param {Object} lead - Lead document
 * @param {Object} config - Routing configuration
 * @returns {Boolean} True if major exclusions found
 */
function checkMajorExclusions(lead, config = {}) {
  const exclusions = config.majorExclusions || [
    'major fire damage',
    'extreme structural damage',
    'condemned',
    'uninhabitable',
    'total loss',
    'demolition required'
  ];
  
  const description = (lead.description || lead.notes || lead.dialerIntake?.sellerReason || '').toLowerCase();
  const redFlags = (lead.dialerIntake?.redFlags || []).map(f => f.toLowerCase());
  
  for (const exclusion of exclusions) {
    if (description.includes(exclusion.toLowerCase()) || 
        redFlags.some(flag => flag.includes(exclusion.toLowerCase()))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Apply routing actions to a lead
 * @param {Object} lead - Lead document (will be saved)
 * @param {Object} routingResult - Result from determineRoute
 * @param {ObjectId} userId - User ID who triggered routing (null for system)
 * @returns {Promise<void>}
 */
async function applyRoutingActions(lead, routingResult, userId = null) {
  // Update lead routing field
  if (!lead.routing) {
    lead.routing = {};
  }
  
  const previousRoute = lead.routing.route;
  const previousPriority = lead.routing.priorityLevel;
  
  lead.routing = {
    route: routingResult.route,
    priorityLevel: routingResult.priorityLevel,
    routedAt: new Date(),
    routedBy: userId || null, // null = system
    routingReasons: routingResult.reasons,
    slaHours: routingResult.slaHours,
    previousRoute,
    previousPriority,
    routingReason: routingResult.routingReason || null // Store reason for cash flow blocks
  };
  
  // Apply tags based on route
  if (!lead.tags) {
    lead.tags = [];
  }
  
  // Remove old routing tags
  const routingTags = ['A_GRADE', 'B_GRADE', 'C_GRADE', 'LOW_SCORE', 'HOT', 'BUYBOX_MATCH', 'HIGH_POTENTIAL', 'NURTURE'];
  lead.tags = lead.tags.filter(tag => !routingTags.includes(tag));
  
  // Add new tags based on route
  if (routingResult.route === 'immediate_closer') {
    lead.tags.push('A_GRADE', 'HOT');
    if (lead.leadScore?.buyBoxId) {
      lead.tags.push('BUYBOX_MATCH');
    }
  } else if (routingResult.route === 'dialer_priority') {
    lead.tags.push('B_GRADE', 'HIGH_POTENTIAL');
  } else if (routingResult.route === 'nurture') {
    lead.tags.push('C_GRADE', 'NURTURE');
  } else if (routingResult.route === 'archive') {
    lead.tags.push('LOW_SCORE');
  }
  
  // Lock intake for immediate_closer
  if (routingResult.shouldLockIntake && lead.dialerIntake) {
    lead.dialerIntake.intakeLocked = true;
  }
  
  // Create closer task (handled via handoff status)
  if (routingResult.shouldCreateCloserTask) {
    if (!lead.handoff) {
      lead.handoff = { status: 'none' };
    }
    // Set handoff to ready_for_closer if not already in closer workflow
    if (lead.handoff.status === 'none' || lead.handoff.status === 'back_to_dialer') {
      lead.handoff.status = 'ready_for_closer';
      lead.handoff.sentToCloserAt = new Date();
      lead.handoff.sentToCloserBy = userId || null;
    }
  }
  
  // Send alert for immediate_closer (if enabled and not already alerted)
  if (routingResult.shouldAlert && routingResult.route === 'immediate_closer') {
    const { sendRoutingAlert } = require('../utils/sms');
    await sendRoutingAlert(lead, routingResult);
  }
  
  await lead.save();
  
  // Log KPI event
  try {
    const KpiEvent = require('../models/KpiEvent');
    await KpiEvent.create({
      userId: userId || null,
      role: 'closer', // System events default to closer role
      leadId: lead._id,
      eventType: 'lead_routed',
      metadata: {
        route: routingResult.route,
        priorityLevel: routingResult.priorityLevel,
        score: lead.leadScore?.score || 0,
        grade: lead.leadScore?.grade || 'Dead',
        reasons: routingResult.reasons,
        previousRoute,
        previousPriority,
        buyBoxMatched: !!lead.leadScore?.buyBoxId
      }
    });
  } catch (kpiErr) {
    console.error('Failed to log routing KPI:', kpiErr);
    // Don't fail if KPI logging fails
  }
}

/**
 * Manually override routing (admin/manager only)
 * @param {Object} lead - Lead document (will be saved)
 * @param {String} route - New route
 * @param {String} priorityLevel - New priority level
 * @param {String} reason - Reason for override
 * @param {ObjectId} userId - User ID performing override
 * @returns {Promise<Object>} Updated routing result
 */
async function overrideRouting(lead, route, priorityLevel, reason, userId) {
  if (!['immediate_closer', 'dialer_priority', 'nurture', 'archive'].includes(route)) {
    throw new Error('Invalid route');
  }
  
  if (!['urgent', 'high', 'normal', 'low'].includes(priorityLevel)) {
    throw new Error('Invalid priority level');
  }
  
  if (!reason || reason.trim().length === 0) {
    throw new Error('Reason is required for routing override');
  }
  
  if (!lead.routing) {
    lead.routing = {};
  }
  
  const previousRoute = lead.routing.route;
  const previousPriority = lead.routing.priorityLevel;
  
  lead.routing = {
    route,
    priorityLevel,
    routedAt: new Date(),
    routedBy: userId,
    routingReasons: [`Manual override: ${reason.trim()}`, ...(lead.routing.routingReasons || [])],
    override: {
      route,
      priorityLevel,
      reason: reason.trim(),
      overriddenBy: userId,
      overriddenAt: new Date(),
      previousRoute,
      previousPriority
    }
  };
  
  await lead.save();
  
  // Log override for KPI tracking
  try {
    const KpiEvent = require('../models/KpiEvent');
    await KpiEvent.create({
      userId,
      role: 'closer', // Default role
      leadId: lead._id,
      eventType: 'routing_override',
      metadata: {
        route,
        priorityLevel,
        reason: reason.trim(),
        previousRoute,
        previousPriority,
        score: lead.leadScore?.score || 0,
        grade: lead.leadScore?.grade || 'Dead'
      }
    });
  } catch (kpiErr) {
    console.error('Failed to log routing override KPI:', kpiErr);
  }
  
  return {
    route,
    priorityLevel,
    reasons: lead.routing.routingReasons
  };
}

module.exports = {
  routeLead,
  determineRoute,
  overrideRouting
};

