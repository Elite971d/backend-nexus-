// services/buyBoxOptimizationService.js
// Automated Buy Box Optimization Engine
// Analyzes DealPerformance data to recommend improvements to Buy Boxes and Scoring Rules

const DealPerformance = require('../models/DealPerformance');
const BuyBox = require('../models/BuyBox');
const BuyBoxRecommendation = require('../models/BuyBoxRecommendation');
const Lead = require('../models/Lead');

/**
 * Generate recommendations for a market and strategy
 * @param {Object} options - { marketKey, strategy, lookbackDays, minSampleSize }
 * @returns {Promise<Array>} Array of recommendation objects
 */
async function generateRecommendations(options = {}) {
  const {
    marketKey,
    strategy,
    lookbackDays = 365,
    minSampleSize = 20
  } = options;

  if (!marketKey || !strategy) {
    throw new Error('marketKey and strategy are required');
  }

  // Get active buy boxes for this market and strategy
  const buyBoxes = await BuyBox.find({
    marketKey,
    strategy,
    active: true
  });

  if (buyBoxes.length === 0) {
    return [];
  }

  const allRecommendations = [];

  // Calculate lookback date
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  // Process each buy box
  for (const buyBox of buyBoxes) {
    const recommendations = await analyzeBuyBox(buyBox, {
      marketKey,
      strategy,
      lookbackDate,
      minSampleSize
    });
    allRecommendations.push(...recommendations);
  }

  return allRecommendations;
}

/**
 * Analyze a specific buy box and generate recommendations
 * @param {Object} buyBox - BuyBox document
 * @param {Object} options - Analysis options
 * @returns {Promise<Array>} Recommendations
 */
async function analyzeBuyBox(buyBox, options) {
  const { marketKey, strategy, lookbackDate, minSampleSize } = options;
  const recommendations = [];

  // Get deal performance data for this buy box
  // Try to match by buyBoxId first, but also include deals that match market/strategy
  // and can be linked via lead's buyBoxId
  const query = {
    marketKey,
    strategy,
    closedDate: { $gte: lookbackDate },
    'proForma.projectedMonthlyCashFlow': { $exists: true },
    'actualPerformance.0': { $exists: true } // Has at least one performance entry
  };

  // Try direct buyBoxId match first (more efficient)
  query.buyBoxId = buyBox._id;
  let dealPerformances = await DealPerformance.find(query)
    .populate('leadId', 'leadScore buyBoxId');

  // If not enough data with direct match, try matching via lead's buyBoxId
  if (dealPerformances.length < minSampleSize) {
    delete query.buyBoxId;
    const allPerformances = await DealPerformance.find(query)
      .populate('leadId', 'leadScore buyBoxId');

    // Filter to only deals that match this buy box via lead's buyBoxId
    dealPerformances = allPerformances.filter(perf => {
      if (perf.leadId && perf.leadId.leadScore && perf.leadId.leadScore.buyBoxId) {
        return perf.leadId.leadScore.buyBoxId.toString() === buyBox._id.toString();
      }
      return false;
    });
  }

  if (dealPerformances.length < minSampleSize) {
    return []; // Not enough data
  }

  // Analyze performance metrics
  const metrics = calculatePerformanceMetrics(dealPerformances);

  // Generate recommendations based on patterns
  const recs = await generateRecommendationsFromMetrics(buyBox, metrics, dealPerformances);
  recommendations.push(...recs);

  return recommendations;
}

/**
 * Calculate performance metrics from deal performance data
 * @param {Array} dealPerformances - Array of DealPerformance documents
 * @returns {Object} Calculated metrics
 */
function calculatePerformanceMetrics(dealPerformances) {
  const cashFlows = [];
  const dscrs = [];
  const cashFlowVariances = [];
  const dscrVariances = [];
  const rentVariances = [];
  const expenseVariances = [];
  const performanceGrades = { A: 0, B: 0, C: 0, D: 0 };
  let negativeCashFlowCount = 0;

  for (const perf of dealPerformances) {
    const latest = perf.getLatestPerformance();
    if (!latest) continue;

    // Actual values
    cashFlows.push(latest.actualMonthlyCashFlow);
    dscrs.push(latest.actualDSCR);

    // Variances
    cashFlowVariances.push(latest.cashFlowVariance || 0);
    dscrVariances.push(latest.dscrVariance || 0);
    rentVariances.push(latest.rentVariance || 0);
    expenseVariances.push(latest.expenseVariance || 0);

    // Performance grades
    if (latest.performanceGrade) {
      performanceGrades[latest.performanceGrade] = (performanceGrades[latest.performanceGrade] || 0) + 1;
    }

    // Negative cash flow count
    if (latest.actualMonthlyCashFlow < 0) {
      negativeCashFlowCount++;
    }
  }

  // Calculate statistics
  const sampleSize = cashFlows.length;
  const sortedCashFlows = [...cashFlows].sort((a, b) => a - b);
  const sortedDscrs = [...dscrs].sort((a, b) => a - b);

  return {
    sampleSize,
    winRate: ((performanceGrades.A || 0) + (performanceGrades.B || 0)) / sampleSize * 100,
    lossRate: ((performanceGrades.C || 0) + (performanceGrades.D || 0)) / sampleSize * 100,
    avgCashFlowVariance: cashFlowVariances.reduce((a, b) => a + b, 0) / sampleSize,
    avgDSCRVariance: dscrVariances.reduce((a, b) => a + b, 0) / sampleSize,
    medianCashFlow: getMedian(sortedCashFlows),
    medianDSCR: getMedian(sortedDscrs),
    tailRiskPct: (negativeCashFlowCount / sampleSize) * 100,
    avgRentVariance: rentVariances.reduce((a, b) => a + b, 0) / sampleSize,
    avgExpenseVariance: expenseVariances.reduce((a, b) => a + b, 0) / sampleSize,
    performanceGrades
  };
}

/**
 * Generate recommendations based on performance metrics
 * @param {Object} buyBox - BuyBox document
 * @param {Object} metrics - Performance metrics
 * @param {Array} dealPerformances - Deal performance data
 * @returns {Promise<Array>} Recommendations
 */
async function generateRecommendationsFromMetrics(buyBox, metrics, dealPerformances) {
  const recommendations = [];
  const reasoning = [];

  // Only generate recommendations for buy_hold and commercial strategies
  if (buyBox.strategy !== 'buy_hold' && buyBox.strategy !== 'commercial') {
    return recommendations;
  }

  // Recommendation 1: Negative cash flow tail risk
  if (metrics.tailRiskPct > 20) {
    const confidence = Math.min(100, Math.round(metrics.tailRiskPct * 2)); // Higher tail risk = higher confidence
    reasoning.push(`Negative cash flow occurs in ${metrics.tailRiskPct.toFixed(1)}% of deals (threshold: 20%)`);
    reasoning.push(`Median cash flow: $${metrics.medianCashFlow.toFixed(2)}/month`);
    reasoning.push(`Average cash flow variance: $${metrics.avgCashFlowVariance.toFixed(2)}/month`);

    // Recommend increasing DSCR minimum
    if (buyBox.cashFlowConfig?.requiredDscr) {
      const currentDscr = buyBox.cashFlowConfig.requiredDscr;
      const recommendedDscr = Math.min(1.5, currentDscr + 0.1); // Increase by 0.1, cap at 1.5
      
      recommendations.push({
        marketKey: buyBox.marketKey,
        buyBoxId: buyBox._id,
        strategy: buyBox.strategy,
        recommendationType: 'dscr_minimum',
        currentValue: currentDscr,
        recommendedValue: recommendedDscr,
        confidence,
        evidenceSummary: `High negative cash flow risk (${metrics.tailRiskPct.toFixed(1)}%) suggests increasing DSCR minimum from ${currentDscr} to ${recommendedDscr}`,
        evidenceMetrics: {
          sampleSize: metrics.sampleSize,
          winRate: metrics.winRate,
          lossRate: metrics.lossRate,
          avgCashFlowVariance: metrics.avgCashFlowVariance,
          avgDSCRVariance: metrics.avgDSCRVariance,
          medianCashFlow: metrics.medianCashFlow,
          medianDSCR: metrics.medianDSCR,
          tailRiskPct: metrics.tailRiskPct,
          reasoning: [...reasoning]
        }
      });
    }

    // Recommend increasing vacancy assumption
    const currentVacancy = buyBox.cashFlowConfig?.vacancyReserve || null;
    if (!currentVacancy || currentVacancy < 0.08) {
      const recommendedVacancy = currentVacancy ? currentVacancy * 1.2 : 0.08; // Increase by 20% or set to 8%
      recommendations.push({
        marketKey: buyBox.marketKey,
        buyBoxId: buyBox._id,
        strategy: buyBox.strategy,
        recommendationType: 'vacancy_assumption',
        currentValue: currentVacancy || 'default (6.5%)',
        recommendedValue: recommendedVacancy,
        confidence: Math.min(100, confidence - 10), // Slightly lower confidence
        evidenceSummary: `High negative cash flow risk suggests increasing vacancy assumption to ${(recommendedVacancy * 100).toFixed(1)}%`,
        evidenceMetrics: {
          sampleSize: metrics.sampleSize,
          winRate: metrics.winRate,
          lossRate: metrics.lossRate,
          avgCashFlowVariance: metrics.avgCashFlowVariance,
          avgDSCRVariance: metrics.avgDSCRVariance,
          medianCashFlow: metrics.medianCashFlow,
          medianDSCR: metrics.medianDSCR,
          tailRiskPct: metrics.tailRiskPct,
          reasoning: [`Negative cash flow in ${metrics.tailRiskPct.toFixed(1)}% of deals`, `Average rent variance: $${metrics.avgRentVariance.toFixed(2)}/month`]
        }
      });
    }
  }

  // Recommendation 2: DSCR consistently below threshold
  if (metrics.medianDSCR < (buyBox.cashFlowConfig?.requiredDscr || 1.25)) {
    const confidence = Math.min(100, Math.round((1 - metrics.medianDSCR / (buyBox.cashFlowConfig?.requiredDscr || 1.25)) * 100));
    const currentDscr = buyBox.cashFlowConfig?.requiredDscr || 1.25;
    const recommendedDscr = Math.min(1.5, metrics.medianDSCR + 0.15); // Set to median + buffer

    recommendations.push({
      marketKey: buyBox.marketKey,
      buyBoxId: buyBox._id,
      strategy: buyBox.strategy,
      recommendationType: 'dscr_minimum',
      currentValue: currentDscr,
      recommendedValue: recommendedDscr,
      confidence: Math.max(confidence, 60), // Minimum 60% confidence
      evidenceSummary: `Median DSCR (${metrics.medianDSCR.toFixed(2)}) is below required threshold (${currentDscr}). Recommend increasing minimum to ${recommendedDscr.toFixed(2)}`,
      evidenceMetrics: {
        sampleSize: metrics.sampleSize,
        winRate: metrics.winRate,
        lossRate: metrics.lossRate,
        avgCashFlowVariance: metrics.avgCashFlowVariance,
        avgDSCRVariance: metrics.avgDSCRVariance,
        medianCashFlow: metrics.medianCashFlow,
        medianDSCR: metrics.medianDSCR,
        tailRiskPct: metrics.tailRiskPct,
        reasoning: [
          `Median DSCR: ${metrics.medianDSCR.toFixed(2)}`,
          `Current requirement: ${currentDscr}`,
          `Average DSCR variance: ${metrics.avgDSCRVariance.toFixed(2)}`
        ]
      }
    });
  }

  // Recommendation 3: Price ceiling too high (if median cash flow is negative)
  if (metrics.medianCashFlow < 0 && buyBox.buyPriceMax) {
    const confidence = Math.min(100, Math.round(Math.abs(metrics.medianCashFlow) / 100)); // More negative = higher confidence
    const priceReduction = Math.round(buyBox.buyPriceMax * 0.1); // Reduce by 10%
    const recommendedPriceMax = buyBox.buyPriceMax - priceReduction;

    recommendations.push({
      marketKey: buyBox.marketKey,
      buyBoxId: buyBox._id,
      strategy: buyBox.strategy,
      recommendationType: 'price_ceiling',
      currentValue: buyBox.buyPriceMax,
      recommendedValue: recommendedPriceMax,
      confidence: Math.max(confidence, 50),
      evidenceSummary: `Negative median cash flow suggests price ceiling may be too high. Recommend reducing from $${buyBox.buyPriceMax.toLocaleString()} to $${recommendedPriceMax.toLocaleString()}`,
      evidenceMetrics: {
        sampleSize: metrics.sampleSize,
        winRate: metrics.winRate,
        lossRate: metrics.lossRate,
        avgCashFlowVariance: metrics.avgCashFlowVariance,
        avgDSCRVariance: metrics.avgDSCRVariance,
        medianCashFlow: metrics.medianCashFlow,
        medianDSCR: metrics.medianDSCR,
        tailRiskPct: metrics.tailRiskPct,
        reasoning: [
          `Median cash flow: $${metrics.medianCashFlow.toFixed(2)}/month`,
          `Current price ceiling: $${buyBox.buyPriceMax.toLocaleString()}`,
          `Recommended reduction: 10%`
        ]
      }
    });
  }

  // Recommendation 4: Expense assumptions too low
  if (metrics.avgExpenseVariance > 100) { // Expenses consistently higher than projected
    const confidence = Math.min(100, Math.round(metrics.avgExpenseVariance / 10));
    const currentMaintenance = buyBox.cashFlowConfig?.maintenanceReserve || null;
    const recommendedMaintenance = currentMaintenance ? currentMaintenance * 1.15 : null; // Increase by 15%

    if (recommendedMaintenance) {
      recommendations.push({
        marketKey: buyBox.marketKey,
        buyBoxId: buyBox._id,
        strategy: buyBox.strategy,
        recommendationType: 'expense_assumption',
        currentValue: currentMaintenance,
        recommendedValue: recommendedMaintenance,
        confidence: Math.max(confidence, 55),
        evidenceSummary: `Expenses consistently exceed projections by $${metrics.avgExpenseVariance.toFixed(2)}/month. Recommend increasing maintenance reserve assumption`,
        evidenceMetrics: {
          sampleSize: metrics.sampleSize,
          winRate: metrics.winRate,
          lossRate: metrics.lossRate,
          avgCashFlowVariance: metrics.avgCashFlowVariance,
          avgDSCRVariance: metrics.avgDSCRVariance,
          medianCashFlow: metrics.medianCashFlow,
          medianDSCR: metrics.medianDSCR,
          tailRiskPct: metrics.tailRiskPct,
          reasoning: [
            `Average expense variance: $${metrics.avgExpenseVariance.toFixed(2)}/month`,
            `Current maintenance reserve: $${currentMaintenance.toFixed(2)}/month`,
            `Recommended increase: 15%`
          ]
        }
      });
    }
  }

  // Save recommendations to database
  const savedRecommendations = [];
  for (const rec of recommendations) {
    // Check if similar recommendation already exists (avoid duplicates)
    const existing = await BuyBoxRecommendation.findOne({
      marketKey: rec.marketKey,
      buyBoxId: rec.buyBoxId,
      recommendationType: rec.recommendationType,
      status: { $in: ['proposed', 'reviewed'] },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Within last 7 days
    });

    if (!existing) {
      const saved = await BuyBoxRecommendation.create(rec);
      savedRecommendations.push(saved);
    }
  }

  return savedRecommendations;
}

/**
 * Get median value from sorted array
 * @param {Array} sortedArray - Sorted array of numbers
 * @returns {Number} Median value
 */
function getMedian(sortedArray) {
  if (sortedArray.length === 0) return 0;
  const mid = Math.floor(sortedArray.length / 2);
  if (sortedArray.length % 2 === 0) {
    return (sortedArray[mid - 1] + sortedArray[mid]) / 2;
  }
  return sortedArray[mid];
}

module.exports = {
  generateRecommendations,
  analyzeBuyBox,
  calculatePerformanceMetrics
};

