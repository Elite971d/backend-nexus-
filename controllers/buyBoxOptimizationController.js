// controllers/buyBoxOptimizationController.js
// Controller for Buy Box Optimization recommendations

const buyBoxOptimizationService = require('../services/buyBoxOptimizationService');
const BuyBoxRecommendation = require('../models/BuyBoxRecommendation');
const BuyBox = require('../models/BuyBox');
const ScoringConfig = require('../models/ScoringConfig');

/**
 * POST /api/buyboxes/optimize/generate
 * Generate recommendations for a market and strategy
 */
exports.generateRecommendations = async (req, res, next) => {
  try {
    const { marketKey, strategy, lookbackDays = 365, minSampleSize = 20 } = req.body;

    if (!marketKey || !strategy) {
      return res.status(400).json({ 
        error: 'marketKey and strategy are required' 
      });
    }

    const recommendations = await buyBoxOptimizationService.generateRecommendations({
      marketKey,
      strategy,
      lookbackDays,
      minSampleSize
    });

    res.json({
      success: true,
      count: recommendations.length,
      recommendations: recommendations.map(rec => ({
        id: rec._id,
        marketKey: rec.marketKey,
        buyBoxId: rec.buyBoxId,
        strategy: rec.strategy,
        recommendationType: rec.recommendationType,
        currentValue: rec.currentValue,
        recommendedValue: rec.recommendedValue,
        confidence: rec.confidence,
        evidenceSummary: rec.evidenceSummary,
        evidenceMetrics: rec.evidenceMetrics,
        status: rec.status,
        createdAt: rec.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/buyboxes/optimize/recommendations
 * View recommendations with optional filtering
 */
exports.getRecommendations = async (req, res, next) => {
  try {
    const { marketKey, strategy, status, buyBoxId } = req.query;

    const query = {};
    if (marketKey) query.marketKey = marketKey;
    if (strategy) query.strategy = strategy;
    if (status) query.status = status;
    if (buyBoxId) query.buyBoxId = buyBoxId;

    const recommendations = await BuyBoxRecommendation.find(query)
      .populate('buyBoxId', 'label marketKey strategy')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: recommendations.length,
      recommendations: recommendations.map(rec => ({
        id: rec._id,
        marketKey: rec.marketKey,
        buyBoxId: rec.buyBoxId?._id,
        buyBoxLabel: rec.buyBoxId?.label,
        strategy: rec.strategy,
        recommendationType: rec.recommendationType,
        currentValue: rec.currentValue,
        recommendedValue: rec.recommendedValue,
        confidence: rec.confidence,
        evidenceSummary: rec.evidenceSummary,
        evidenceMetrics: rec.evidenceMetrics,
        status: rec.status,
        reviewedBy: rec.reviewedBy ? {
          id: rec.reviewedBy._id,
          name: rec.reviewedBy.name,
          email: rec.reviewedBy.email
        } : null,
        reviewedAt: rec.reviewedAt,
        decisionNote: rec.decisionNote,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/buyboxes/optimize/recommendations/:id/accept
 * Accept a recommendation and apply it to the BuyBox or ScoringConfig
 */
exports.acceptRecommendation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decisionNote } = req.body;
    const userId = req.user.id;

    if (!decisionNote || decisionNote.trim().length === 0) {
      return res.status(400).json({ 
        error: 'decisionNote is required when accepting a recommendation' 
      });
    }

    const recommendation = await BuyBoxRecommendation.findById(id)
      .populate('buyBoxId');

    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    if (recommendation.status === 'accepted') {
      return res.status(400).json({ error: 'Recommendation already accepted' });
    }

    if (recommendation.status === 'rejected') {
      return res.status(400).json({ error: 'Recommendation was rejected and cannot be accepted' });
    }

    // Apply the recommendation
    await applyRecommendation(recommendation, userId);

    // Update recommendation status
    recommendation.status = 'accepted';
    recommendation.reviewedBy = userId;
    recommendation.reviewedAt = new Date();
    recommendation.decisionNote = decisionNote;
    await recommendation.save();

    res.json({
      success: true,
      message: 'Recommendation accepted and applied',
      recommendation: {
        id: recommendation._id,
        recommendationType: recommendation.recommendationType,
        status: recommendation.status,
        reviewedAt: recommendation.reviewedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/buyboxes/optimize/recommendations/:id/reject
 * Reject a recommendation
 */
exports.rejectRecommendation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decisionNote } = req.body;
    const userId = req.user.id;

    if (!decisionNote || decisionNote.trim().length === 0) {
      return res.status(400).json({ 
        error: 'decisionNote is required when rejecting a recommendation' 
      });
    }

    const recommendation = await BuyBoxRecommendation.findById(id);

    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    if (recommendation.status === 'rejected') {
      return res.status(400).json({ error: 'Recommendation already rejected' });
    }

    if (recommendation.status === 'accepted') {
      return res.status(400).json({ error: 'Recommendation was accepted and cannot be rejected' });
    }

    // Update recommendation status
    recommendation.status = 'rejected';
    recommendation.reviewedBy = userId;
    recommendation.reviewedAt = new Date();
    recommendation.decisionNote = decisionNote;
    await recommendation.save();

    res.json({
      success: true,
      message: 'Recommendation rejected',
      recommendation: {
        id: recommendation._id,
        recommendationType: recommendation.recommendationType,
        status: recommendation.status,
        reviewedAt: recommendation.reviewedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply a recommendation to the target BuyBox or ScoringConfig
 * @param {Object} recommendation - BuyBoxRecommendation document
 * @param {ObjectId} userId - User ID applying the change
 */
async function applyRecommendation(recommendation, userId) {
  const buyBox = await BuyBox.findById(recommendation.buyBoxId);
  if (!buyBox) {
    throw new Error('BuyBox not found');
  }

  switch (recommendation.recommendationType) {
    case 'dscr_minimum':
      if (!buyBox.cashFlowConfig) {
        buyBox.cashFlowConfig = {};
      }
      buyBox.cashFlowConfig.requiredDscr = recommendation.recommendedValue;
      await buyBox.save();
      break;

    case 'vacancy_assumption':
      if (!buyBox.cashFlowConfig) {
        buyBox.cashFlowConfig = {};
      }
      buyBox.cashFlowConfig.vacancyReserve = recommendation.recommendedValue;
      await buyBox.save();
      break;

    case 'expense_assumption':
      if (!buyBox.cashFlowConfig) {
        buyBox.cashFlowConfig = {};
      }
      buyBox.cashFlowConfig.maintenanceReserve = recommendation.recommendedValue;
      await buyBox.save();
      break;

    case 'price_ceiling':
      buyBox.buyPriceMax = recommendation.recommendedValue;
      await buyBox.save();
      break;

    case 'scoring_weight_adjustment':
      // Create or update ScoringConfig
      await updateScoringConfig(buyBox.marketKey, buyBox.strategy, recommendation, userId);
      break;

    case 'city_override_adjustment':
      // This would require more complex logic to determine which city override to adjust
      // For now, we'll log it but not auto-apply
      console.log('City override adjustment requires manual review:', recommendation);
      break;

    case 'exclusion_rule':
      // Add exclusion to buy box
      if (!buyBox.exclusions) {
        buyBox.exclusions = [];
      }
      if (typeof recommendation.recommendedValue === 'string') {
        if (!buyBox.exclusions.includes(recommendation.recommendedValue)) {
          buyBox.exclusions.push(recommendation.recommendedValue);
        }
      }
      await buyBox.save();
      break;

    default:
      console.warn('Unknown recommendation type:', recommendation.recommendationType);
  }
}

/**
 * Update or create ScoringConfig for a market/strategy
 * @param {String} marketKey - Market key
 * @param {String} strategy - Strategy
 * @param {Object} recommendation - Recommendation document
 * @param {ObjectId} userId - User ID
 */
async function updateScoringConfig(marketKey, strategy, recommendation, userId) {
  // Get current active config
  let activeConfig = await ScoringConfig.findOne({
    marketKey,
    strategy,
    status: 'active'
  });

  // Archive current active config if exists
  if (activeConfig) {
    activeConfig.status = 'archived';
    activeConfig.archivedBy = userId;
    activeConfig.archivedAt = new Date();
    await activeConfig.save();
  }

  // Get latest draft or create new one
  let draftConfig = await ScoringConfig.findOne({
    marketKey,
    strategy,
    status: 'draft'
  }).sort({ version: -1 });

  if (!draftConfig) {
    // Create new draft based on active config or defaults
    const baseConfig = activeConfig || {
      weights: {
        propertyType: 20,
        bedsBaths: 15,
        sqft: 10,
        yearBuilt: 10,
        condition: 15,
        buyPrice: 20,
        arv: 10,
        location: 10
      },
      assumptions: {
        vacancyRate: 0.065,
        maintenanceRate: 0.065,
        managementRate: 0.09,
        interestRateBuffer: 0.0075,
        baseInterestRate: 0.07
      }
    };

    const latestVersion = activeConfig ? activeConfig.version : 0;
    draftConfig = new ScoringConfig({
      marketKey,
      strategy,
      version: latestVersion + 1,
      status: 'draft',
      weights: baseConfig.weights,
      assumptions: baseConfig.assumptions,
      createdBy: userId
    });
  }

  // Apply recommendation to draft config
  // Note: This assumes recommendedValue contains the weight adjustments
  // In a real implementation, you'd parse the recommendation more carefully
  if (typeof recommendation.recommendedValue === 'object') {
    if (recommendation.recommendedValue.weights) {
      draftConfig.weights = { ...draftConfig.weights, ...recommendation.recommendedValue.weights };
    }
    if (recommendation.recommendedValue.assumptions) {
      draftConfig.assumptions = { ...draftConfig.assumptions, ...recommendation.recommendedValue.assumptions };
    }
  }

  await draftConfig.save();
}

