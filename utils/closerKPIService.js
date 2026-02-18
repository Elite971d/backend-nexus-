// utils/closerKPIService.js
const CloserKPI = require('../models/CloserKPI');
const KpiEvent = require('../models/KpiEvent');
const Lead = require('../models/Lead');

/**
 * Get or create CloserKPI record for a user for the current week
 */
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getWeekEnd(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return weekEnd;
}

/**
 * Update CloserKPI for a user for the current week based on events
 * Called automatically when relevant events occur
 */
async function updateCloserKPI(userId, weekStart = null) {
  try {
    if (!weekStart) {
      weekStart = getWeekStart();
    }
    const weekEnd = getWeekEnd(weekStart);

    // Get or create KPI record
    let kpi = await CloserKPI.findOne({ userId, weekStartDate: weekStart });
    
    if (!kpi) {
      kpi = await CloserKPI.create({
        userId,
        weekStartDate: weekStart,
        weekEndDate: weekEnd
      });
    }

    // Get all events for this week
    const events = await KpiEvent.find({
      userId,
      role: 'closer',
      createdAt: { $gte: weekStart, $lt: weekEnd }
    }).populate('leadId');

    // Count events
    const offersSent = events.filter(e => e.eventType === 'offer_sent').length;
    const buyerBlastsSent = events.filter(e => e.eventType === 'buyer_blast_sent').length;
    const contractsSent = events.filter(e => e.eventType === 'contract_sent').length;
    const contractsSigned = events.filter(e => e.eventType === 'contract_signed').length;

    // Count leads reviewed (any closer action on a lead)
    const reviewedLeadIds = new Set();
    events.forEach(e => {
      if (e.leadId) {
        reviewedLeadIds.add(e.leadId._id.toString());
      }
    });
    const leadsReviewed = reviewedLeadIds.size;

    // Calculate average response time
    // Time from lead assignment (routedAt or handoff.sentToCloserAt) to first action
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    
    for (const event of events) {
      if (event.leadId && event.eventType !== 'lead_routed') {
        const lead = await Lead.findById(event.leadId._id).select('routing handoff createdAt');
        if (lead) {
          const assignmentTime = lead.handoff?.sentToCloserAt || lead.routing?.routedAt || lead.createdAt;
          if (assignmentTime && event.createdAt) {
            const responseTimeHours = (new Date(event.createdAt) - new Date(assignmentTime)) / (1000 * 60 * 60);
            if (responseTimeHours >= 0 && responseTimeHours < 168) { // Within 1 week, reasonable
              totalResponseTime += responseTimeHours;
              responseTimeCount++;
            }
          }
        }
      }
    }
    const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : null;

    // Calculate conversion rate (leads reviewed -> contracts signed)
    const conversionRate = leadsReviewed > 0 
      ? Math.round((contractsSigned / leadsReviewed) * 100) 
      : 0;

    // Calculate offer to contract rate
    const offerToContractRate = offersSent > 0
      ? Math.round((contractsSigned / offersSent) * 100)
      : 0;

    // Calculate blast to interest rate
    // Based on buyer feedback with responseType='interested' for leads that were blasted
    let blastToInterestRate = 0;
    if (buyerBlastsSent > 0) {
      const BuyerFeedback = require('../models/BuyerFeedback');
      const DealBlast = require('../models/DealBlast');
      
      // Get all blasts created by this user in this week
      const blasts = await DealBlast.find({
        createdBy: userId,
        sentAt: { $gte: weekStart, $lt: weekEnd },
        status: 'sent'
      }).select('leadId');
      
      const leadIds = blasts.map(b => b.leadId);
      
      // Count interested feedback for these leads
      const interestedFeedbackCount = await BuyerFeedback.countDocuments({
        leadId: { $in: leadIds },
        responseType: 'interested',
        createdAt: { $gte: weekStart, $lt: weekEnd }
      });
      
      blastToInterestRate = Math.round((interestedFeedbackCount / buyerBlastsSent) * 100);
    }

    // Calculate average deal spread (if offer amounts available)
    let totalSpread = 0;
    let spreadCount = 0;
    
    for (const event of events) {
      if (event.eventType === 'offer_sent' && event.leadId) {
        const lead = await Lead.findById(event.leadId._id).select('closer askingPrice listPrice');
        if (lead && lead.closer?.offerAmount) {
          const listPrice = lead.askingPrice || lead.listPrice;
          if (listPrice) {
            const spread = listPrice - lead.closer.offerAmount;
            totalSpread += spread;
            spreadCount++;
          }
        }
      }
    }
    const avgDealSpread = spreadCount > 0 ? Math.round(totalSpread / spreadCount) : null;

    // Update KPI record
    kpi.leadsReviewed = leadsReviewed;
    kpi.offersSent = offersSent;
    kpi.buyerBlastsSent = buyerBlastsSent;
    kpi.contractsSent = contractsSent;
    kpi.contractsSigned = contractsSigned;
    kpi.avgResponseTime = avgResponseTime ? Math.round(avgResponseTime * 10) / 10 : null; // Round to 1 decimal
    kpi.conversionRate = conversionRate;
    kpi.avgDealSpread = avgDealSpread;
    kpi.offerToContractRate = offerToContractRate;
    kpi.blastToInterestRate = blastToInterestRate;
    
    await kpi.save();

    return kpi;
  } catch (err) {
    console.error(`[CloserKPI] Error updating CloserKPI for user ${userId}:`, err);
    throw err;
  }
}

/**
 * Trigger CloserKPI update for a user (async, non-blocking)
 */
function triggerCloserKPIUpdate(userId, weekStart = null) {
  updateCloserKPI(userId, weekStart).catch(err => {
    console.error(`[CloserKPI] Failed to trigger update for user ${userId}:`, err);
  });
}

module.exports = {
  updateCloserKPI,
  triggerCloserKPIUpdate,
  getWeekStart,
  getWeekEnd
};

