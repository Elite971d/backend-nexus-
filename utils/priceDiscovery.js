// utils/priceDiscovery.js
const Lead = require('../models/Lead');
const BuyerFeedback = require('../models/BuyerFeedback');
const Buyer = require('../models/Buyer');

/**
 * Run price discovery analysis for a lead based on buyer feedback
 * Aggregates buyer feedback, weights by buyer quality, and calculates:
 * - interestScore (0-100)
 * - rejectionRate (0-100)
 * - suggestedPriceAdjustment (±%)
 * 
 * Results are stored on the Lead model but never auto-change prices (suggestions only)
 */
async function runPriceDiscovery(leadId) {
  try {
    const lead = await Lead.findById(leadId);
    if (!lead) {
      console.error(`[Price Discovery] Lead ${leadId} not found`);
      return null;
    }

    // Get all feedback for this lead
    const feedback = await BuyerFeedback.find({ leadId })
      .populate('buyerId')
      .sort({ createdAt: -1 });

    if (feedback.length === 0) {
      // No feedback yet, clear discovery fields
      lead.buyerInterestScore = null;
      lead.suggestedPriceRange = null;
      lead.lastPriceDiscoveryAt = null;
      await lead.save();
      return null;
    }

    // Calculate weighted scores
    let totalWeight = 0;
    let weightedInterest = 0;
    let weightedRejection = 0;
    let priceTooHighCount = 0;
    let interestedCount = 0;
    let passCount = 0;

    for (const fb of feedback) {
      const buyer = fb.buyerId;
      if (!buyer) continue;

      // Calculate buyer weight based on quality metrics
      // Higher weight = more trusted buyer opinion
      let buyerWeight = 1.0; // Default weight
      
      // Weight by close rate (if available, default to 0.1 for calculation)
      const closeRate = buyer.closeRate || 0.1;
      buyerWeight *= (0.5 + closeRate * 0.5); // Scale between 0.5-1.0
      
      // Weight by responsiveness score (if available)
      const responsiveness = buyer.responsivenessScore || 50;
      buyerWeight *= (0.7 + (responsiveness / 100) * 0.3); // Scale between 0.7-1.0
      
      // Weight by buyer type (buy_and_hold generally more reliable for pricing)
      if (buyer.buyerType === 'buy_and_hold') {
        buyerWeight *= 1.2;
      }

      totalWeight += buyerWeight;

      // Score feedback
      if (fb.responseType === 'interested') {
        weightedInterest += buyerWeight;
        interestedCount++;
      } else if (fb.responseType === 'pass') {
        weightedRejection += buyerWeight;
        passCount++;
      } else if (fb.responseType === 'price_too_high') {
        weightedRejection += buyerWeight;
        priceTooHighCount++;
      } else if (fb.responseType === 'wrong_market') {
        // Don't count wrong_market as rejection for pricing purposes
        // (it's a targeting issue, not a pricing issue)
      }

      // Needs more info is neutral (doesn't affect scoring)
    }

    // Calculate interest score (0-100)
    // Higher interest = higher score
    let interestScore = 0;
    if (totalWeight > 0) {
      const interestRatio = weightedInterest / totalWeight;
      interestScore = Math.round(interestRatio * 100);
    }

    // Calculate rejection rate (0-100)
    // Higher rejection = higher rate
    let rejectionRate = 0;
    if (totalWeight > 0) {
      const rejectionRatio = weightedRejection / totalWeight;
      rejectionRate = Math.round(rejectionRatio * 100);
    }

    // Calculate suggested price adjustment
    // Based on price_too_high feedback ratio
    let suggestedPriceAdjustment = 0; // Percentage change
    const priceFeedbackRatio = priceTooHighCount / feedback.length;
    
    if (priceTooHighCount > 0 && feedback.length >= 3) {
      // If >50% say too high, suggest reduction
      // Reduction amount based on how many say too high
      if (priceFeedbackRatio >= 0.7) {
        suggestedPriceAdjustment = -15; // Suggest 15% reduction
      } else if (priceFeedbackRatio >= 0.5) {
        suggestedPriceAdjustment = -10; // Suggest 10% reduction
      } else if (priceFeedbackRatio >= 0.3) {
        suggestedPriceAdjustment = -5; // Suggest 5% reduction
      }
    } else if (interestedCount > 0 && priceTooHighCount === 0 && feedback.length >= 3) {
      // If good interest and no price complaints, might be able to increase slightly
      const interestRatio = interestedCount / feedback.length;
      if (interestRatio >= 0.5) {
        suggestedPriceAdjustment = 5; // Suggest 5% increase (conservative)
      }
    }

    // Calculate suggested price range
    let suggestedPriceRange = null;
    const currentPrice = lead.askingPrice || lead.listPrice;
    if (currentPrice && suggestedPriceAdjustment !== 0) {
      const adjustmentFactor = 1 + (suggestedPriceAdjustment / 100);
      const suggestedPrice = Math.round(currentPrice * adjustmentFactor);
      
      // Create a range (±5% around suggested price)
      const rangeBuffer = suggestedPrice * 0.05;
      suggestedPriceRange = {
        min: Math.round(suggestedPrice - rangeBuffer),
        max: Math.round(suggestedPrice + rangeBuffer),
        suggested: suggestedPrice,
        current: currentPrice,
        adjustmentPercent: suggestedPriceAdjustment
      };
    } else if (currentPrice) {
      // No adjustment suggested, but include current price as reference
      suggestedPriceRange = {
        min: currentPrice,
        max: currentPrice,
        suggested: currentPrice,
        current: currentPrice,
        adjustmentPercent: 0
      };
    }

    // Store results on lead
    lead.buyerInterestScore = interestScore;
    lead.suggestedPriceRange = suggestedPriceRange;
    lead.lastPriceDiscoveryAt = new Date();
    await lead.save();

    return {
      interestScore,
      rejectionRate,
      suggestedPriceAdjustment,
      suggestedPriceRange,
      feedbackCount: feedback.length,
      interestedCount,
      passCount,
      priceTooHighCount
    };
  } catch (err) {
    console.error(`[Price Discovery] Error running price discovery for lead ${leadId}:`, err);
    throw err;
  }
}

module.exports = {
  runPriceDiscovery
};

