// services/skipTraceService.js
const Lead = require('../models/Lead');
const KpiEvent = require('../models/KpiEvent');
const { skipTrace: runSkipTrace } = require('../utils/skiptrace');
const { emitToTenant, emitToRole, emitToRoom, emitToUser } = require('../utils/realtime');
const { notifySkipTraceComplete } = require('./notificationService');


/**
 * Performs skip trace for a lead
 * @param {string} leadId - Lead ID
 * @param {string} userId - User ID who requested the skip trace
 * @returns {Promise<Object>} Updated lead with skip trace data
 */
async function skipTraceLead(leadId, userId) {
  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new Error('Lead not found');
  }

  // Check if skip trace is locked
  if (lead.skipTraceLocked) {
    throw new Error('Skip trace is locked. Only admin can unlock and re-run.');
  }

  // Initialize skipTrace if it doesn't exist
  if (!lead.skipTrace) {
    lead.skipTrace = {
      status: 'not_requested',
      phones: [],
      emails: [],
      mailingAddresses: [],
      entityInfo: {}
    };
  }

  // Set status to pending
  lead.skipTrace.status = 'pending';
  lead.skipTrace.requestedAt = new Date();
  lead.skipTrace.requestedBy = userId;
  await lead.save();

  console.log(`[SkipTraceService] Skip trace started for lead ${leadId}`);

  // Emit KPI event
  try {
    await KpiEvent.create({
      userId,
      role: 'closer', // Skip trace is typically requested by closer/manager
      leadId,
      eventType: 'skip_trace_requested',
      metadata: {}
    });
  } catch (err) {
    console.error('Failed to create KPI event:', err);
  }

  try {
    // Run skip trace using orchestrator (runs all providers)
    const result = await runSkipTrace(lead);

    // Determine status based on results
    const hasData = (result.phones?.length > 0) || (result.emails?.length > 0) || (result.mailingAddresses?.length > 0);
    const status = hasData ? 'completed' : 'no_data';

    // Update lead skipTrace data
    lead.skipTrace.status = status;
    lead.skipTrace.completedAt = new Date();
    lead.skipTrace.phones = result.phones || [];
    lead.skipTrace.emails = result.emails || [];
    lead.skipTrace.mailingAddresses = result.mailingAddresses || [];
    lead.skipTrace.entityInfo = result.entityInfo || {
      isLLC: null,
      entityName: null,
      registeredState: null
    };
    lead.skipTrace.confidenceScore = result.confidenceScore || 0;
    lead.skipTrace.provider = result.source || 'orchestrator';
    
    // Update top-level fields for easy access
    lead.phones = (result.phones || []).map(p => p.number || p);
    lead.emails = (result.emails || []).map(e => e.email || e);
    lead.skipTraceStatus = status;
    lead.skipTraceSources = result.skipTraceSources || [];
    lead.lastSkipTracedAt = new Date();

    await lead.save();

    const phonesCount = result.phones?.length || 0;
    const emailsCount = result.emails?.length || 0;
    
    if (hasData) {
      console.log(`[SkipTraceService] Skip trace completed — phones: ${phonesCount}, emails: ${emailsCount}`);
      
      // Create notification for skip trace completion
      try {
        const { notifySkipTraceComplete } = require('../services/notificationService');
        await notifySkipTraceComplete(lead, userId);
      } catch (notifErr) {
        console.error('Failed to create skip trace notification:', notifErr);
      }
    } else {
      console.log(`[SkipTraceService] Skip trace no data found`);
    }

    // Recalculate lead score after skip trace completion (this will also trigger routing)
    try {
      const { recalculateAndSaveLeadScore } = require('../utils/leadScoringEngine');
      await recalculateAndSaveLeadScore(lead);
    } catch (scoreErr) {
      console.error('Failed to recalculate lead score after skip trace:', scoreErr);
      // Don't fail the skip trace if scoring fails
    }

    // Explicitly trigger routing after skip trace completion
    try {
      const { routeLead } = require('../services/dealRoutingService');
      await routeLead(lead, { skipActions: false, userId });
    } catch (routingErr) {
      console.error('Failed to route lead after skip trace completion:', routingErr);
      // Don't fail the skip trace if routing fails
    }

    // Emit success KPI event
    try {
      await KpiEvent.create({
        userId,
        role: 'closer',
        leadId,
        eventType: hasData ? 'skip_trace_completed' : 'skip_trace_no_data',
        metadata: {
          provider: result.source || 'orchestrator',
          phonesFound: phonesCount,
          emailsFound: emailsCount,
          confidenceScore: result.confidenceScore || 0,
          sources: result.skipTraceSources || []
        }
      });
    } catch (err) {
      console.error('Failed to create KPI event:', err);
    }

    // Emit real-time events
    if (lead.tenantId) {
      emitToTenant(lead.tenantId, 'skiptrace:completed', { 
        leadId: lead._id, 
        lead,
        phonesCount,
        emailsCount,
        status
      });
      emitToRoom(`lead:${lead._id}`, 'skiptrace:completed', { 
        leadId: lead._id, 
        lead,
        phonesCount,
        emailsCount,
        status
      });
      emitToUser(userId, 'skiptrace:completed', { 
        leadId: lead._id, 
        lead,
        phonesCount,
        emailsCount,
        status
      });
    }

    return lead;
  } catch (error) {
    // Update status to failed (but don't crash - graceful handling)
    console.error(`[SkipTraceService] Skip trace error for lead ${leadId}:`, error.message);
    
    lead.skipTrace.status = 'failed';
    lead.skipTrace.notes = error.message || 'Skip trace failed';
    await lead.save();

    // Emit failure KPI event
    try {
      await KpiEvent.create({
        userId,
        role: 'closer',
        leadId,
        eventType: 'skip_trace_failed',
        metadata: {
          error: error.message
        }
      });
    } catch (err) {
      console.error('Failed to create KPI event:', err);
    }

    // Don't throw - return lead with failed status (non-blocking)
    return lead;
  }
}

/**
 * Estimates cost for skip trace
 * Free/freemium providers return 0
 */
async function estimateSkipTraceCost(leadId) {
  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new Error('Lead not found');
  }

  // Free/freemium providers have no cost
  // Future paid providers can be added here
  return 0;
}

module.exports = {
  skipTraceLead,
  estimateSkipTraceCost
};

