// utils/buyerQualityScoring.js
const Buyer = require('../models/Buyer');
const BuyerFeedback = require('../models/BuyerFeedback');
const DealBlastRecipient = require('../models/DealBlastRecipient');

/**
 * Update buyer quality scores based on feedback history
 * - responsivenessScore: Based on response rate and response time
 * - closeRate: Based on interested feedback vs total feedback
 * - lastResponseAt: Timestamp of most recent response
 */
async function updateBuyerQualityScores(buyerId) {
  try {
    const buyer = await Buyer.findById(buyerId);
    if (!buyer) {
      console.error(`[Buyer Quality] Buyer ${buyerId} not found`);
      return null;
    }

    // Get all feedback for this buyer
    const allFeedback = await BuyerFeedback.find({ buyerId })
      .sort({ createdAt: -1 });

    // Get all deal blast recipients (to calculate response rate)
    const allRecipients = await DealBlastRecipient.find({ 
      buyerId,
      status: { $in: ['sent', 'delivered', 'replied', 'interested', 'not_interested'] }
    })
      .sort({ sentAt: -1 });

    // Calculate responsiveness score (0-100)
    // Based on response rate (how often they respond to blasts)
    let responsivenessScore = 50; // Default to 50 (neutral)
    
    if (allRecipients.length > 0) {
      const respondedCount = allRecipients.filter(r => 
        r.status === 'replied' || r.status === 'interested' || r.status === 'not_interested'
      ).length;
      
      const responseRate = respondedCount / allRecipients.length;
      
      // Convert response rate (0-1) to score (0-100)
      // 0% response = 0, 100% response = 100
      responsivenessScore = Math.round(responseRate * 100);
      
      // Bonus for fast responses (within 24 hours)
      if (allFeedback.length > 0) {
        const recentFeedback = allFeedback
          .filter(fb => {
            if (!fb.createdAt) return false;
            // Check if feedback was within 24 hours of associated blast
            // For simplicity, assume recent feedback is fast
            const daysSince = (new Date() - new Date(fb.createdAt)) / (1000 * 60 * 60 * 24);
            return daysSince <= 1;
          }).length;
        
        if (recentFeedback > 0) {
          const fastResponseBonus = Math.min(10, (recentFeedback / allFeedback.length) * 10);
          responsivenessScore = Math.min(100, responsivenessScore + fastResponseBonus);
        }
      }
    }

    // Calculate close rate (0-1)
    // Based on interested feedback vs total feedback
    let closeRate = 0.1; // Default to 10%
    
    if (allFeedback.length > 0) {
      const interestedCount = allFeedback.filter(fb => fb.responseType === 'interested').length;
      closeRate = interestedCount / allFeedback.length;
    }

    // Get last response timestamp
    let lastResponseAt = null;
    if (allFeedback.length > 0) {
      const mostRecent = allFeedback[0];
      lastResponseAt = mostRecent.createdAt || new Date();
    }

    // Update buyer
    buyer.responsivenessScore = Math.round(responsivenessScore);
    buyer.closeRate = Math.round(closeRate * 100) / 100; // Round to 2 decimals
    buyer.lastResponseAt = lastResponseAt;
    await buyer.save();

    return {
      responsivenessScore: buyer.responsivenessScore,
      closeRate: buyer.closeRate,
      lastResponseAt: buyer.lastResponseAt
    };
  } catch (err) {
    console.error(`[Buyer Quality] Error updating buyer quality scores for buyer ${buyerId}:`, err);
    throw err;
  }
}

module.exports = {
  updateBuyerQualityScores
};

