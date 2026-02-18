// utils/leadScoringEngine.js
const BuyBox = require('../models/BuyBox');
const { getStateFromMarket, normalizeMarket } = require('./marketUtils');
const { calculateCashFlow, extractCashFlowInputsFromLead } = require('./cashFlowCalculator');

/**
 * Score a lead against active Buy Boxes for its market
 * @param {Object} lead - Lead document
 * @param {Array<Object>} buyBoxes - Optional array of BuyBoxes (if not provided, will fetch active ones)
 * @returns {Promise<Object>} Scoring result
 */
async function scoreLead(lead, buyBoxes = null) {
  // Default result
  const defaultResult = {
    score: 0,
    grade: 'Dead',
    leadTier: 'cold',
    matchedBuyBox: null,
    reasons: [],
    failedChecks: []
  };

  // Determine market from lead
  const marketKey = determineMarketKey(lead);
  if (!marketKey) {
    return {
      ...defaultResult,
      failedChecks: ['Could not determine market from lead location']
    };
  }

  // Get active buy boxes for this market if not provided
  if (!buyBoxes) {
    buyBoxes = await BuyBox.find({
      marketKey: marketKey,
      active: true
    });
  }

  if (!buyBoxes || buyBoxes.length === 0) {
    return {
      ...defaultResult,
      failedChecks: [`No active Buy Boxes found for market: ${marketKey}`]
    };
  }

  // Score against each buy box and return the best match
  let bestScore = 0;
  let bestResult = defaultResult;

  for (const buyBox of buyBoxes) {
    const result = scoreLeadAgainstBuyBox(lead, buyBox);
    if (result.score > bestScore) {
      bestScore = result.score;
      bestResult = result;
    }
  }

  return bestResult;
}

/**
 * Score a lead against a specific Buy Box
 * @param {Object} lead - Lead document
 * @param {Object} buyBox - BuyBox document
 * @returns {Object} Scoring result
 */
function scoreLeadAgainstBuyBox(lead, buyBox) {
  const result = {
    score: 0,
    grade: 'Dead',
    leadTier: 'cold',
    matchedBuyBox: {
      id: buyBox._id,
      marketKey: buyBox.marketKey,
      label: buyBox.label
    },
    reasons: [],
    failedChecks: []
  };

  let totalWeight = 0;
  let earnedWeight = 0;

  // Extract lead data
  const propertyType = normalizePropertyType(lead.dialerIntake?.propertyType || lead.propertyType);
  const beds = lead.dialerIntake?.beds || lead.beds;
  const baths = lead.dialerIntake?.baths || lead.baths;
  const sqft = lead.dialerIntake?.sqft || lead.sqft;
  const yearBuilt = lead.dialerIntake?.yearBuilt || lead.yearBuilt;
  const condition = normalizeCondition(lead.dialerIntake?.conditionTier);
  const askingPrice = lead.dialerIntake?.askingPrice || lead.askingPrice;
  const arv = lead.arv;
  const city = (lead.dialerIntake?.propertyAddress || lead.propertyAddress || lead.city || '').toLowerCase();
  const county = (lead.county || '').toLowerCase();
  const description = (lead.description || lead.notes || lead.dialerIntake?.sellerReason || '').toLowerCase();

  // Check 1: Property Type Match (pass/fail - 20 points)
  const weight1 = 20;
  totalWeight += weight1;
  if (buyBox.propertyType && buyBox.propertyType.length > 0) {
    const normalizedBuyBoxTypes = buyBox.propertyType.map(pt => pt.toUpperCase());
    if (propertyType && normalizedBuyBoxTypes.includes(propertyType)) {
      earnedWeight += weight1;
      result.reasons.push('Property type matches Buy Box');
    } else {
      result.failedChecks.push(`Property type mismatch: ${propertyType || 'unknown'} not in ${buyBox.propertyType.join(', ')}`);
      return { ...result, score: 0 }; // Fail fast on property type
    }
  }

  // Check 2: Beds/Baths Match (15 points)
  const weight2 = 15;
  totalWeight += weight2;
  let bedsBathsMatch = true;
  if (buyBox.minBeds !== undefined && buyBox.minBeds !== null) {
    if (!beds || beds < buyBox.minBeds) {
      bedsBathsMatch = false;
      result.failedChecks.push(`Beds insufficient: ${beds || 'unknown'} < ${buyBox.minBeds}`);
    }
  }
  if (buyBox.minBaths !== undefined && buyBox.minBaths !== null) {
    if (!baths || baths < buyBox.minBaths) {
      bedsBathsMatch = false;
      result.failedChecks.push(`Baths insufficient: ${baths || 'unknown'} < ${buyBox.minBaths}`);
    }
  }
  if (bedsBathsMatch) {
    earnedWeight += weight2;
    result.reasons.push(`Beds/Baths meet requirements (${beds || '?'}/${baths || '?'})`);
  }

  // Check 3: Sq Ft Match (10 points)
  const weight3 = 10;
  totalWeight += weight3;
  if (buyBox.minSqft !== undefined && buyBox.minSqft !== null) {
    if (sqft && sqft >= buyBox.minSqft) {
      earnedWeight += weight3;
      result.reasons.push(`Square footage meets requirement (${sqft} >= ${buyBox.minSqft})`);
    } else {
      result.failedChecks.push(`Square footage insufficient: ${sqft || 'unknown'} < ${buyBox.minSqft}`);
    }
  } else {
    // No requirement, give full points
    earnedWeight += weight3;
  }

  // Check 4: Year Built Match (10 points)
  const weight4 = 10;
  totalWeight += weight4;
  if (buyBox.minYearBuilt !== undefined && buyBox.minYearBuilt !== null) {
    if (yearBuilt && yearBuilt >= buyBox.minYearBuilt) {
      earnedWeight += weight4;
      result.reasons.push(`Year built meets requirement (${yearBuilt} >= ${buyBox.minYearBuilt})`);
    } else {
      result.failedChecks.push(`Year built insufficient: ${yearBuilt || 'unknown'} < ${buyBox.minYearBuilt}`);
    }
  } else {
    // No requirement, give full points
    earnedWeight += weight4;
  }

  // Check 5: Condition Match (15 points)
  const weight5 = 15;
  totalWeight += weight5;
  if (buyBox.conditionAllowed && buyBox.conditionAllowed.length > 0) {
    if (condition && buyBox.conditionAllowed.includes(condition)) {
      earnedWeight += weight5;
      result.reasons.push(`Condition matches allowed types: ${condition}`);
    } else {
      result.failedChecks.push(`Condition mismatch: ${condition || 'unknown'} not in ${buyBox.conditionAllowed.join(', ')}`);
    }
  } else {
    // No requirement, give full points
    earnedWeight += weight5;
  }

  // Check 6: Buy Price Within Range (20 points)
  const weight6 = 20;
  totalWeight += weight6;
  if (askingPrice) {
    // Check for city override
    let buyPriceMin = buyBox.buyPriceMin;
    let buyPriceMax = buyBox.buyPriceMax;
    
    if (buyBox.cityOverrides && typeof buyBox.cityOverrides === 'object') {
      for (const [cityName, override] of Object.entries(buyBox.cityOverrides)) {
        if (city.includes(cityName.toLowerCase())) {
          if (override.buyPriceMin !== undefined) buyPriceMin = override.buyPriceMin;
          if (override.buyPriceMax !== undefined) buyPriceMax = override.buyPriceMax;
          result.reasons.push(`Using city override for ${cityName}`);
          break;
        }
      }
    }

    if (askingPrice >= buyPriceMin && askingPrice <= buyPriceMax) {
      earnedWeight += weight6;
      result.reasons.push(`Asking price within range: $${askingPrice.toLocaleString()} (${buyPriceMin.toLocaleString()}-${buyPriceMax.toLocaleString()})`);
    } else {
      result.failedChecks.push(`Asking price out of range: $${askingPrice.toLocaleString()} not in ${buyPriceMin.toLocaleString()}-${buyPriceMax.toLocaleString()}`);
    }
  } else {
    result.failedChecks.push('Asking price not available');
  }

  // Check 7: ARV Within Range (10 points)
  const weight7 = 10;
  totalWeight += weight7;
  if (buyBox.arvMin !== undefined && buyBox.arvMax !== undefined) {
    if (arv && arv >= buyBox.arvMin && arv <= buyBox.arvMax) {
      earnedWeight += weight7;
      result.reasons.push(`ARV within range: $${arv.toLocaleString()} (${buyBox.arvMin.toLocaleString()}-${buyBox.arvMax.toLocaleString()})`);
    } else if (arv) {
      result.failedChecks.push(`ARV out of range: $${arv.toLocaleString()} not in ${buyBox.arvMin.toLocaleString()}-${buyBox.arvMax.toLocaleString()}`);
    } else {
      // ARV not available but required - partial penalty
      earnedWeight += weight7 * 0.5;
      result.failedChecks.push('ARV not available');
    }
  } else {
    // No ARV requirement, give full points
    earnedWeight += weight7;
  }

  // Check 8: Location Match (County/City) (10 points)
  const weight8 = 10;
  totalWeight += weight8;
  let locationMatch = false;
  if (buyBox.counties && buyBox.counties.length > 0) {
    const normalizedCounties = buyBox.counties.map(c => c.toLowerCase().trim());
    if (county && normalizedCounties.includes(county)) {
      locationMatch = true;
      earnedWeight += weight8;
      result.reasons.push(`County matches: ${county}`);
    } else {
      result.failedChecks.push(`County mismatch: ${county || 'unknown'} not in ${buyBox.counties.join(', ')}`);
    }
  } else {
    // No county requirement, give full points
    locationMatch = true;
    earnedWeight += weight8;
  }

  // Check 9: Exclusion Flags (pass/fail - can reduce score)
  if (buyBox.exclusions && buyBox.exclusions.length > 0) {
    const exclusionMatches = buyBox.exclusions.filter(exclusion => {
      const exclusionLower = exclusion.toLowerCase();
      return description.includes(exclusionLower) || 
             (lead.dialerIntake?.redFlags || []).some(flag => flag.toLowerCase().includes(exclusionLower));
    });

    if (exclusionMatches.length > 0) {
      // Major penalty for exclusions
      earnedWeight = Math.max(0, earnedWeight - 30);
      result.failedChecks.push(`Exclusion flags found: ${exclusionMatches.join(', ')}`);
    } else {
      result.reasons.push('No exclusion flags detected');
    }
  }

  // Calculate final score
  result.score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  result.score = Math.max(0, Math.min(100, result.score)); // Clamp 0-100

  // Determine grade
  if (result.score >= 85) {
    result.grade = 'A';
  } else if (result.score >= 70) {
    result.grade = 'B';
  } else if (result.score >= 50) {
    result.grade = 'C';
  } else if (result.score >= 30) {
    result.grade = 'D';
  } else {
    result.grade = 'Dead';
  }

  // Determine leadTier based on score and source type
  // Probate and high-scoring leads are "hot"
  // Code violations with vacancy indicators or preforeclosures with high delinquent amounts are "warm"
  // Everything else is "cold"
  if (lead.source === 'probate' || result.score >= 70) {
    result.leadTier = 'hot';
  } else if (
    (lead.source === 'code_violation' && lead.description?.toLowerCase().includes('vacant')) ||
    (lead.source === 'preforeclosure' && lead.delinquentAmount && lead.delinquentAmount > 20000) ||
    result.score >= 50
  ) {
    result.leadTier = 'warm';
  } else {
    result.leadTier = 'cold';
  }

  // CASH FLOW ENFORCEMENT: For buy_hold and commercial strategies
  // Check if buy box requires positive cash flow
  const strategy = buyBox.strategy || 'flip';
  const requiresCashFlow = buyBox.requiresPositiveCashFlow || 
                          strategy === 'buy_hold' || 
                          strategy === 'commercial';

  if (requiresCashFlow) {
    try {
      // Extract cash flow inputs from lead
      const cashFlowInputs = extractCashFlowInputsFromLead(lead, buyBox);
      
      // Calculate cash flow
      const cashFlowResult = calculateCashFlow(cashFlowInputs);
      
      // Store cash flow results in result object
      result.cashFlow = {
        monthlyCashFlow: cashFlowResult.monthlyCashFlow,
        annualCashFlow: cashFlowResult.annualCashFlow,
        dscr: cashFlowResult.dscr,
        cashFlowPass: cashFlowResult.cashFlowPass,
        dscrPass: cashFlowResult.dscrPass,
        assumptionsUsed: cashFlowResult.assumptionsUsed,
        breakdown: cashFlowResult.breakdown
      };

      // ENFORCE CASH FLOW RULE: If cash flow fails, max grade is C
      if (!cashFlowResult.cashFlowPass) {
        if (result.grade === 'A' || result.grade === 'B') {
          result.grade = 'C';
          result.failedChecks.push('Cash flow requirement failed: Monthly cash flow is not positive');
          result.reasons = result.reasons.filter(r => !r.includes('A-grade') && !r.includes('B-grade'));
        }
      }

      // ENFORCE DSCR RULE: If DSCR fails, max grade is C
      if (cashFlowResult.dscr !== null && !cashFlowResult.dscrPass) {
        if (result.grade === 'A' || result.grade === 'B') {
          result.grade = 'C';
          result.failedChecks.push(`DSCR requirement failed: ${cashFlowResult.dscr.toFixed(2)} < ${cashFlowResult.requiredDscr.toFixed(2)}`);
        }
      }

      // A-grade requires BOTH positive cash flow AND DSCR pass
      if (result.grade === 'A') {
        if (!cashFlowResult.cashFlowPass || !cashFlowResult.dscrPass) {
          result.grade = 'B'; // Downgrade to B if cash flow or DSCR fails
          if (!cashFlowResult.cashFlowPass) {
            result.failedChecks.push('A-grade requires positive cash flow');
          }
          if (!cashFlowResult.dscrPass) {
            result.failedChecks.push(`A-grade requires DSCR >= ${cashFlowResult.requiredDscr.toFixed(2)}`);
          }
        } else {
          result.reasons.push(`Cash flow positive: $${cashFlowResult.monthlyCashFlow.toFixed(2)}/month`);
          result.reasons.push(`DSCR: ${cashFlowResult.dscr.toFixed(2)} (meets requirement)`);
        }
      }
    } catch (cashFlowError) {
      console.error('Error calculating cash flow:', cashFlowError);
      // If cash flow calculation fails, treat as failure for buy_hold/commercial
      if (strategy === 'buy_hold' || strategy === 'commercial') {
        result.failedChecks.push(`Cash flow calculation error: ${cashFlowError.message}`);
        if (result.grade === 'A' || result.grade === 'B') {
          result.grade = 'C';
        }
        result.cashFlow = {
          cashFlowPass: false,
          dscrPass: false,
          error: cashFlowError.message
        };
      }
    }
  }

  return result;
}

/**
 * Determine market key from lead location
 * @param {Object} lead - Lead document
 * @returns {string|null} Market key (e.g., "TX-DFW")
 */
function determineMarketKey(lead) {
  // Try to extract from state and county/city
  const state = lead.state;
  const county = lead.county;
  const city = lead.city || lead.dialerIntake?.propertyAddress || lead.propertyAddress;

  if (!state) return null;

  const stateCode = state.toUpperCase().substring(0, 2);
  
  // For DFW area, check for Dallas, Tarrant, Collin, Denton counties
  if (stateCode === 'TX') {
    const dfwCounties = ['dallas', 'tarrant', 'collin', 'denton'];
    if (county && dfwCounties.includes(county.toLowerCase())) {
      return 'TX-DFW';
    }
    // Could add more TX markets here
  }

  // For other states, create a basic market key
  // This is a simplified version - could be enhanced with geocoding
  if (stateCode && county) {
    return `${stateCode}-${county.toUpperCase().replace(/\s+/g, '')}`;
  }

  // Fallback: state-level market
  if (stateCode) {
    return `${stateCode}-STATE`;
  }

  return null;
}

/**
 * Normalize property type to BuyBox format
 * @param {string} propertyType - Property type from lead
 * @returns {string|null} Normalized property type
 */
function normalizePropertyType(propertyType) {
  if (!propertyType) return null;
  const pt = propertyType.toUpperCase();
  if (pt.includes('SFR') || pt.includes('SINGLE') || pt.includes('SFH') || pt.includes('HOUSE')) {
    return 'SFR';
  }
  if (pt.includes('MULTI') || pt.includes('MF') || pt.includes('DUPLEX') || pt.includes('TRIPLEX') || pt.includes('QUAD')) {
    return 'MF';
  }
  if (pt.includes('LAND') || pt.includes('LOT')) {
    return 'Land';
  }
  if (pt.includes('COMMERCIAL') || pt.includes('RETAIL') || pt.includes('OFFICE')) {
    return 'Commercial';
  }
  return null;
}

/**
 * Normalize condition to BuyBox format
 * @param {string} condition - Condition from lead
 * @returns {string|null} Normalized condition
 */
function normalizeCondition(condition) {
  if (!condition) return null;
  const cond = condition.toLowerCase();
  if (['light', '1', '2'].includes(cond)) return 'light';
  if (['medium', '3'].includes(cond)) return 'medium';
  if (['heavy', '4', '5'].includes(cond)) return 'heavy';
  return condition; // Return as-is if it matches enum values
}

/**
 * Recalculate and save score for a lead
 * @param {Object} lead - Lead document (will be saved)
 * @param {Object} options - Options { skipKpiLog: boolean }
 * @returns {Promise<Object>} Updated lead with score
 */
async function recalculateAndSaveLeadScore(lead, options = {}) {
  const scoringResult = await scoreLead(lead);
  
  // Store previous score for comparison
  const previousScore = lead.leadScore?.score || 0;
  const previousGrade = lead.leadScore?.grade || 'Dead';
  
  // Update lead with score
  if (!lead.leadScore) {
    lead.leadScore = {};
  }
  
  // Check if this is a new high-grade match (A or B) that should trigger notification
  const isNewHighGrade = (scoringResult.grade === 'A' || scoringResult.grade === 'B') && 
                          scoringResult.matchedBuyBox && 
                          (previousGrade !== 'A' && previousGrade !== 'B');
  
  // Preserve override if it exists
  const existingOverride = lead.leadScore.override;
  
  lead.leadScore = {
    score: scoringResult.score,
    grade: existingOverride ? existingOverride.grade : scoringResult.grade, // Use override if exists
    buyBoxKey: scoringResult.matchedBuyBox?.marketKey || null,
    buyBoxId: scoringResult.matchedBuyBox?.id || null,
    buyBoxLabel: scoringResult.matchedBuyBox?.label || null,
    evaluatedAt: new Date(),
    reasons: scoringResult.reasons,
    failedChecks: scoringResult.failedChecks,
    cashFlow: scoringResult.cashFlow || null, // Store cash flow results
    override: existingOverride || null // Preserve override
  };

  // Update leadTier
  lead.leadTier = scoringResult.leadTier || 'cold';

  // Also update legacy score field for backward compatibility
  lead.score = scoringResult.score;

  await lead.save();
  
  // Create notification if lead gets high grade (A or B) with buy box match
  if (isNewHighGrade) {
    try {
      const { notifyLeadMatchesBuyBox } = require('../services/notificationService');
      const User = require('../models/user');
      // Notify admins and closers
      const users = await User.find({ role: { $in: ['admin', 'closer', 'manager'] } });
      for (const user of users) {
        await notifyLeadMatchesBuyBox(lead, user._id, scoringResult.matchedBuyBox.label);
      }
    } catch (notifErr) {
      console.error('Failed to create buy box match notification:', notifErr);
    }
  }
  
  // Trigger automatic routing after score calculation
  try {
    const { routeLead } = require('../services/dealRoutingService');
    await routeLead(lead, { skipActions: false, userId: null }); // System routing
  } catch (routingErr) {
    console.error('Failed to route lead after score calculation:', routingErr);
    // Don't fail if routing fails
  }
  
  // Log KPI event for score calculation (unless skipped)
  if (!options.skipKpiLog) {
    try {
      const KpiEvent = require('../models/KpiEvent');
      await KpiEvent.create({
        userId: null, // System-generated
        role: 'closer', // Default role for system events
        leadId: lead._id,
        eventType: 'score_calculated',
        metadata: {
          score: scoringResult.score,
          grade: lead.leadScore.grade,
          previousScore,
          previousGrade,
          buyBoxKey: scoringResult.matchedBuyBox?.marketKey || null,
          reasons: scoringResult.reasons.length,
          failedChecks: scoringResult.failedChecks.length
        }
      });
    } catch (kpiErr) {
      console.error('Failed to log score calculation KPI:', kpiErr);
      // Don't fail if KPI logging fails
    }
  }
  
  return lead;
}

module.exports = {
  scoreLead,
  scoreLeadAgainstBuyBox,
  recalculateAndSaveLeadScore,
  determineMarketKey
};

