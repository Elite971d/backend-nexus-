// services/performanceFeedbackService.js
// Feedback loops for performance data to improve buy boxes, lead scoring, and buyer matching

const DealPerformance = require('../models/DealPerformance');
const BuyBox = require('../models/BuyBox');
const Buyer = require('../models/Buyer');
const { calculateBuyBoxPerformanceMetrics } = require('../utils/performanceGrading');

/**
 * Update buy box accuracy flags based on performance data
 * Flags buy boxes with repeated C/D outcomes
 */
async function updateBuyBoxAccuracy(buyBoxId) {
  try {
    const performances = await DealPerformance.find({ buyBoxId });
    
    if (performances.length === 0) {
      return null;
    }
    
    const metrics = calculateBuyBoxPerformanceMetrics(performances);
    
    // Flag buy box if performance rate is below threshold
    const performanceThreshold = 0.6; // 60% A/B grades
    const warningThreshold = 0.4; // 40% A/B grades
    
    const buyBox = await BuyBox.findById(buyBoxId);
    if (!buyBox) {
      return null;
    }
    
    // Add performance metadata to buy box
    if (!buyBox.metadata) {
      buyBox.metadata = {};
    }
    
    buyBox.metadata.performanceMetrics = {
      totalDeals: metrics.totalDeals,
      performanceRate: metrics.performanceRate,
      gradeDistribution: metrics.gradeDistribution,
      averageCashFlowVariance: metrics.averageCashFlowVariance,
      averageDSCRVariance: metrics.averageDSCRVariance,
      lastUpdated: new Date()
    };
    
    // Set warning flags
    const warnings = [];
    if (metrics.performanceRate < warningThreshold) {
      warnings.push('critical_performance_issue');
      buyBox.metadata.performanceWarning = 'CRITICAL';
    } else if (metrics.performanceRate < performanceThreshold) {
      warnings.push('performance_concern');
      buyBox.metadata.performanceWarning = 'WARNING';
    } else {
      buyBox.metadata.performanceWarning = null;
    }
    
    // Check for specific issues
    if (metrics.averageCashFlowVariance < -200) {
      warnings.push('systematic_cash_flow_shortfall');
    }
    if (metrics.averageDSCRVariance < -0.2) {
      warnings.push('systematic_dscr_shortfall');
    }
    
    buyBox.metadata.performanceWarnings = warnings;
    
    await buyBox.save();
    
    return {
      buyBoxId,
      metrics,
      warnings
    };
  } catch (err) {
    console.error('Error updating buy box accuracy:', err);
    return null;
  }
}

/**
 * Update buyer engagement score based on performance
 * Increases score for buyers with strong execution
 * Decreases score for buyers with repeated underperformance
 */
async function updateBuyerEngagementScore(buyerId) {
  try {
    const performances = await DealPerformance.find({ buyerId });
    
    if (performances.length === 0) {
      return null;
    }
    
    const buyer = await Buyer.findById(buyerId);
    if (!buyer) {
      return null;
    }
    
    // Calculate performance metrics for this buyer
    const metrics = calculateBuyBoxPerformanceMetrics(performances);
    
    // Base engagement score calculation
    // Start with performance rate (0-100)
    let newEngagementScore = metrics.performanceRate;
    
    // Bonus for high volume (more deals = more reliable)
    if (metrics.totalDeals >= 10) {
      newEngagementScore += 5;
    } else if (metrics.totalDeals >= 5) {
      newEngagementScore += 2;
    }
    
    // Penalty for systematic underperformance
    if (metrics.averageCashFlowVariance < -300) {
      newEngagementScore -= 10;
    } else if (metrics.averageCashFlowVariance < -100) {
      newEngagementScore -= 5;
    }
    
    // Bonus for exceeding projections
    if (metrics.averageCashFlowVariance > 100) {
      newEngagementScore += 5;
    }
    
    // Cap at 0-100
    newEngagementScore = Math.max(0, Math.min(100, newEngagementScore));
    
    // Update buyer
    const previousScore = buyer.engagementScore || 0;
    buyer.engagementScore = Math.round(newEngagementScore);
    
    // Store performance metadata
    if (!buyer.metadata) {
      buyer.metadata = {};
    }
    
    buyer.metadata.performanceMetrics = {
      totalDeals: metrics.totalDeals,
      performanceRate: metrics.performanceRate,
      gradeDistribution: metrics.gradeDistribution,
      averageCashFlowVariance: metrics.averageCashFlowVariance,
      lastUpdated: new Date()
    };
    
    await buyer.save();
    
    return {
      buyerId,
      previousScore,
      newScore: buyer.engagementScore,
      metrics
    };
  } catch (err) {
    console.error('Error updating buyer engagement score:', err);
    return null;
  }
}

/**
 * Process feedback loops when a new performance period is added
 * This should be called after saving a performance record
 */
async function processPerformanceFeedback(performanceId) {
  try {
    const performance = await DealPerformance.findById(performanceId)
      .populate('buyBoxId')
      .populate('buyerId');
    
    if (!performance) {
      return;
    }
    
    const results = {
      buyBox: null,
      buyer: null
    };
    
    // Update buy box accuracy if buy box exists
    if (performance.buyBoxId) {
      const buyBoxId = performance.buyBoxId._id ? performance.buyBoxId._id.toString() : performance.buyBoxId.toString();
      results.buyBox = await updateBuyBoxAccuracy(buyBoxId);
    }
    
    // Update buyer engagement score
    if (performance.buyerId) {
      const buyerId = performance.buyerId._id ? performance.buyerId._id.toString() : performance.buyerId.toString();
      results.buyer = await updateBuyerEngagementScore(buyerId);
    }
    
    return results;
  } catch (err) {
    console.error('Error processing performance feedback:', err);
    return null;
  }
}

/**
 * Get buy box performance warnings for admin UI
 */
async function getBuyBoxWarnings(marketKey = null) {
  try {
    const query = { active: true };
    if (marketKey) {
      query.marketKey = marketKey;
    }
    
    const buyBoxes = await BuyBox.find(query);
    
    const warnings = [];
    
    for (const buyBox of buyBoxes) {
      if (buyBox.metadata?.performanceWarning) {
        warnings.push({
          buyBoxId: buyBox._id,
          buyBoxLabel: buyBox.label,
          marketKey: buyBox.marketKey,
          warning: buyBox.metadata.performanceWarning,
          warnings: buyBox.metadata.performanceWarnings || [],
          metrics: buyBox.metadata.performanceMetrics || null
        });
      }
    }
    
    return warnings;
  } catch (err) {
    console.error('Error getting buy box warnings:', err);
    return [];
  }
}

/**
 * Recalculate all feedback loops (for batch processing)
 */
async function recalculateAllFeedbackLoops() {
  try {
    // Get all unique buy boxes with performance data
    const buyBoxIds = await DealPerformance.distinct('buyBoxId', { buyBoxId: { $ne: null } });
    
    // Get all unique buyers with performance data
    const buyerIds = await DealPerformance.distinct('buyerId');
    
    const results = {
      buyBoxes: [],
      buyers: []
    };
    
    // Update all buy boxes
    for (const buyBoxId of buyBoxIds) {
      const result = await updateBuyBoxAccuracy(buyBoxId);
      if (result) {
        results.buyBoxes.push(result);
      }
    }
    
    // Update all buyers
    for (const buyerId of buyerIds) {
      const result = await updateBuyerEngagementScore(buyerId);
      if (result) {
        results.buyers.push(result);
      }
    }
    
    return results;
  } catch (err) {
    console.error('Error recalculating feedback loops:', err);
    return null;
  }
}

module.exports = {
  updateBuyBoxAccuracy,
  updateBuyerEngagementScore,
  processPerformanceFeedback,
  getBuyBoxWarnings,
  recalculateAllFeedbackLoops
};

