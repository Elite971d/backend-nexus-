// services/buyerMatchingService.js
const Buyer = require('../models/Buyer');
const DealBlastRecipient = require('../models/DealBlastRecipient');
const { normalizeMarket, getStateFromMarket } = require('../utils/marketUtils');

/**
 * Determine market key from lead
 * @param {Object} lead - Lead document
 * @returns {string|null} Market key (e.g., "TX-DFW")
 */
function determineMarketKey(lead) {
  // Try to get from lead metadata or routing
  if (lead.metadata?.marketKey) {
    return normalizeMarket(lead.metadata.marketKey);
  }
  
  // Try to determine from location
  const state = lead.state || lead.dialerIntake?.propertyAddress?.match(/\b([A-Z]{2})\b/i)?.[1];
  const city = lead.city || lead.dialerIntake?.propertyAddress?.split(',')[0]?.trim();
  
  if (state) {
    const stateCode = state.toUpperCase();
    // For now, use state-level market if city not available
    // In production, you'd have a city-to-market mapping
    if (city) {
      // Try to match city to known markets
      const cityUpper = city.toUpperCase();
      // This is a simplified version - in production, use a proper mapping
      return normalizeMarket(`${stateCode}-${cityUpper}`);
    }
    return normalizeMarket(`${stateCode}-STATE`);
  }
  
  return null;
}

/**
 * Normalize property type for matching
 * @param {string} propertyType - Property type from lead
 * @returns {string|null} Normalized property type
 */
function normalizePropertyType(propertyType) {
  if (!propertyType) return null;
  const pt = propertyType.toUpperCase();
  // Map common variations
  if (pt === 'SFR' || pt === 'SFH' || pt === 'SINGLE_FAMILY') return 'SFR';
  if (pt === 'MF' || pt === 'MULTI_FAMILY' || pt === 'MULTIFAMILY') return 'MF';
  if (pt === 'LAND' || pt === 'LOT') return 'LAND';
  if (pt === 'COMMERCIAL' || pt === 'COMM') return 'COMMERCIAL';
  return pt;
}

/**
 * Normalize condition tier for matching
 * @param {string} conditionTier - Condition tier from lead
 * @returns {string|null} Normalized condition
 */
function normalizeCondition(conditionTier) {
  if (!conditionTier) return null;
  const cond = conditionTier.toLowerCase();
  // Map numeric to text
  if (cond === '1' || cond === 'light') return 'light';
  if (cond === '2' || cond === 'medium') return 'medium';
  if (cond === '3' || cond === '4' || cond === '5' || cond === 'heavy') return 'heavy';
  return cond;
}

/**
 * Check if buyer matches lead criteria
 * @param {Object} buyer - Buyer document
 * @param {Object} lead - Lead document
 * @param {string} channel - Channel (internal|sms|email)
 * @returns {Object} { matched: boolean, reasons: [], excluded: boolean, exclusionReason: string }
 */
function checkBuyerMatch(buyer, lead, channel) {
  const reasons = [];
  let excluded = false;
  let exclusionReason = null;
  
  // Extract lead data
  const marketKey = determineMarketKey(lead);
  const propertyType = normalizePropertyType(lead.dialerIntake?.propertyType || lead.propertyType);
  const beds = lead.dialerIntake?.beds || lead.beds;
  const baths = lead.dialerIntake?.baths || lead.baths;
  const sqft = lead.dialerIntake?.sqft || lead.sqft;
  const yearBuilt = lead.dialerIntake?.yearBuilt || lead.yearBuilt;
  const condition = normalizeCondition(lead.dialerIntake?.conditionTier);
  const askingPrice = lead.dialerIntake?.askingPrice || lead.askingPrice;
  const arv = lead.arv;
  const city = (lead.city || '').toLowerCase();
  const county = (lead.county || '').toLowerCase();
  
  // Check opt-out
  if (channel === 'sms' && (buyer.smsOptOut || buyer.optOut?.sms)) {
    excluded = true;
    exclusionReason = 'Buyer opted out of SMS';
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  if (channel === 'email' && buyer.optOut?.email) {
    excluded = true;
    exclusionReason = 'Buyer opted out of email';
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  
  // Check cooldown
  if (buyer.lastBlastAt) {
    const hoursSinceLastBlast = (Date.now() - buyer.lastBlastAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastBlast < (buyer.cooldownHours || 72)) {
      excluded = true;
      exclusionReason = `Buyer on cooldown (last blast ${Math.round(hoursSinceLastBlast)}h ago)`;
      return { matched: false, reasons: [], excluded, exclusionReason };
    }
  }
  
  // Market match (required)
  const buyerMarkets = buyer.preferredMarkets && buyer.preferredMarkets.length > 0 
    ? buyer.preferredMarkets 
    : buyer.markets; // Fallback to legacy markets field
  
  if (!buyerMarkets || buyerMarkets.length === 0) {
    excluded = true;
    exclusionReason = 'No preferred markets set';
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  
  if (!marketKey || !buyerMarkets.includes(marketKey)) {
    excluded = true;
    exclusionReason = `Market mismatch: lead is ${marketKey || 'unknown'}, buyer wants ${buyerMarkets.join(', ')}`;
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  
  reasons.push(`Market match: ${marketKey}`);
  
  // Property type match
  if (buyer.propertyTypes && buyer.propertyTypes.length > 0) {
    const normalizedBuyerTypes = buyer.propertyTypes.map(pt => normalizePropertyType(pt));
    if (propertyType && normalizedBuyerTypes.includes(propertyType)) {
      reasons.push(`Property type match: ${propertyType}`);
    } else {
      excluded = true;
      exclusionReason = `Property type mismatch: lead is ${propertyType || 'unknown'}, buyer wants ${buyer.propertyTypes.join(', ')}`;
      return { matched: false, reasons: [], excluded, exclusionReason };
    }
  }
  
  // Beds/baths/sqft/year built thresholds
  if (buyer.minBeds && beds && beds < buyer.minBeds) {
    excluded = true;
    exclusionReason = `Beds too low: ${beds} < ${buyer.minBeds}`;
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  if (buyer.minBeds && beds && beds >= buyer.minBeds) {
    reasons.push(`Beds match: ${beds} >= ${buyer.minBeds}`);
  }
  
  if (buyer.minBaths && baths && baths < buyer.minBaths) {
    excluded = true;
    exclusionReason = `Baths too low: ${baths} < ${buyer.minBaths}`;
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  if (buyer.minBaths && baths && baths >= buyer.minBaths) {
    reasons.push(`Baths match: ${baths} >= ${buyer.minBaths}`);
  }
  
  if (buyer.minSqft && sqft && sqft < buyer.minSqft) {
    excluded = true;
    exclusionReason = `Sqft too low: ${sqft} < ${buyer.minSqft}`;
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  if (buyer.minSqft && sqft && sqft >= buyer.minSqft) {
    reasons.push(`Sqft match: ${sqft} >= ${buyer.minSqft}`);
  }
  
  if (buyer.minYearBuilt && yearBuilt && yearBuilt < buyer.minYearBuilt) {
    excluded = true;
    exclusionReason = `Year built too old: ${yearBuilt} < ${buyer.minYearBuilt}`;
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  if (buyer.minYearBuilt && yearBuilt && yearBuilt >= buyer.minYearBuilt) {
    reasons.push(`Year built match: ${yearBuilt} >= ${buyer.minYearBuilt}`);
  }
  
  // Rehab tolerance match
  if (buyer.maxRehabLevel && condition) {
    const rehabLevels = { light: 1, medium: 2, heavy: 3 };
    const buyerLevel = rehabLevels[buyer.maxRehabLevel] || 3;
    const leadLevel = rehabLevels[condition] || 3;
    
    if (leadLevel > buyerLevel) {
      excluded = true;
      exclusionReason = `Rehab level too high: ${condition} > ${buyer.maxRehabLevel}`;
      return { matched: false, reasons: [], excluded, exclusionReason };
    }
    reasons.push(`Rehab tolerance match: ${condition} <= ${buyer.maxRehabLevel}`);
  }
  
  // Price fit
  if (buyer.maxBuyPrice && askingPrice && askingPrice > buyer.maxBuyPrice) {
    excluded = true;
    exclusionReason = `Price too high: $${askingPrice} > $${buyer.maxBuyPrice}`;
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  if (buyer.maxBuyPrice && askingPrice && askingPrice <= buyer.maxBuyPrice) {
    reasons.push(`Price fit: $${askingPrice} <= $${buyer.maxBuyPrice}`);
  }
  
  // ARV fit
  if (buyer.minArv && arv && arv < buyer.minArv) {
    excluded = true;
    exclusionReason = `ARV too low: $${arv} < $${buyer.minArv}`;
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  if (buyer.minArv && arv && arv >= buyer.minArv) {
    reasons.push(`ARV fit: $${arv} >= $${buyer.minArv}`);
  }
  
  // County/city exact match (bonus)
  if (buyer.preferredCounties && buyer.preferredCounties.length > 0) {
    const normalizedCounties = buyer.preferredCounties.map(c => c.toLowerCase());
    if (county && normalizedCounties.includes(county)) {
      reasons.push(`County exact match: ${county}`);
    }
  }
  
  if (buyer.preferredCities && buyer.preferredCities.length > 0) {
    const normalizedCities = buyer.preferredCities.map(c => c.toLowerCase());
    if (city && normalizedCities.includes(city)) {
      reasons.push(`City exact match: ${city}`);
    }
  }
  
  // Check for major exclusions (fire/extreme structural damage)
  const description = (lead.description || lead.notes || lead.dialerIntake?.sellerReason || '').toLowerCase();
  const hasMajorFire = description.includes('fire') || description.includes('burned');
  const hasExtremeStructural = description.includes('structural damage') || description.includes('foundation');
  
  if ((hasMajorFire || hasExtremeStructural) && buyer.maxRehabLevel !== 'heavy') {
    excluded = true;
    exclusionReason = 'Major fire/extreme structural damage - buyer does not accept heavy rehab';
    return { matched: false, reasons: [], excluded, exclusionReason };
  }
  
  // CASH FLOW ENFORCEMENT: For buy_hold and commercial strategies
  // Check if buyer strategy requires cash flow (rental = buy_hold)
  const buyerStrategies = buyer.strategies || [];
  const buyerRequiresCashFlow = buyerStrategies.includes('rental'); // 'rental' maps to buy_hold
  
  // Check if cash flow was calculated (indicates buy_hold or commercial strategy)
  const cashFlow = lead.leadScore?.cashFlow;
  const strategyRequiresCashFlow = cashFlow !== null && cashFlow !== undefined; // Cash flow was calculated
  
  // If either buyer or strategy requires cash flow, check cash flow pass
  if (buyerRequiresCashFlow || strategyRequiresCashFlow) {
    if (!cashFlow || cashFlow.cashFlowPass === false) {
      excluded = true;
      exclusionReason = 'Cash flow requirement failed: Monthly cash flow is not positive';
      return { matched: false, reasons: [], excluded, exclusionReason };
    }
    
    if (!cashFlow.dscrPass) {
      excluded = true;
      exclusionReason = `DSCR requirement failed: ${cashFlow.dscr?.toFixed(2) || 'N/A'} below threshold`;
      return { matched: false, reasons: [], excluded, exclusionReason };
    }
    
    // Cash flow passed - add to reasons
    reasons.push(`Cash flow positive: $${cashFlow.monthlyCashFlow?.toFixed(2) || 'N/A'}/month`);
    reasons.push(`DSCR: ${cashFlow.dscr?.toFixed(2) || 'N/A'} (meets requirement)`);
  }
  
  return { matched: true, reasons, excluded: false, exclusionReason: null };
}

/**
 * Calculate buyer match score for ranking
 * @param {Object} buyer - Buyer document
 * @param {Object} lead - Lead document
 * @param {Object} matchResult - Result from checkBuyerMatch
 * @returns {number} Score (0-100)
 */
function calculateBuyerScore(buyer, lead, matchResult) {
  if (!matchResult.matched) return 0;
  
  let score = 50; // Base score
  
  // Market + county/city exact match bonus
  const marketKey = determineMarketKey(lead);
  const city = (lead.city || '').toLowerCase();
  const county = (lead.county || '').toLowerCase();
  
  const buyerMarkets = buyer.preferredMarkets && buyer.preferredMarkets.length > 0 
    ? buyer.preferredMarkets 
    : buyer.markets;
  
  if (buyerMarkets && buyerMarkets.includes(marketKey)) {
    score += 10; // Market match
  }
  
  if (buyer.preferredCounties && buyer.preferredCounties.includes(county)) {
    score += 10; // County exact match
  }
  
  if (buyer.preferredCities && buyer.preferredCities.includes(city)) {
    score += 10; // City exact match
  }
  
  // Historical engagement score
  if (buyer.engagementScore) {
    score += buyer.engagementScore * 0.2; // Up to 20 points
  }
  
  // Proof of funds on file
  if (buyer.proofOfFundsOnFile) {
    score += 5;
  }
  
  // Recent purchase date (more recent = higher score)
  if (buyer.lastPurchaseDate) {
    const daysSincePurchase = (Date.now() - buyer.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePurchase < 90) {
      score += 5; // Purchased in last 90 days
    } else if (daysSincePurchase < 180) {
      score += 3; // Purchased in last 180 days
    }
  }
  
  // Bonus for cash flow positive deals (for buy_hold/commercial buyers)
  const cashFlow = lead.leadScore?.cashFlow;
  if (cashFlow && cashFlow.cashFlowPass && cashFlow.dscrPass) {
    const buyerStrategies = buyer.strategies || [];
    if (buyerStrategies.includes('rental')) {
      // Bonus for exceeding minimum cash flow
      if (cashFlow.monthlyCashFlow > 200) {
        score += 5; // Strong cash flow bonus
      } else if (cashFlow.monthlyCashFlow > 100) {
        score += 3; // Moderate cash flow bonus
      }
      
      // Bonus for exceeding DSCR threshold
      if (cashFlow.dscr && cashFlow.requiredDscr) {
        const dscrMargin = cashFlow.dscr - cashFlow.requiredDscr;
        if (dscrMargin > 0.5) {
          score += 3; // Strong DSCR margin
        } else if (dscrMargin > 0.25) {
          score += 2; // Moderate DSCR margin
        }
      }
    }
  }
  
  // Cap at 100
  return Math.min(100, Math.round(score));
}

/**
 * Match buyers for a lead
 * @param {Object} lead - Lead document
 * @param {Object} options - Options { channel: 'internal'|'sms'|'email', maxResults: number }
 * @returns {Promise<Array>} Array of { buyer, score, reasons, excluded, exclusionReason }
 */
async function matchBuyersForLead(lead, options = {}) {
  const { channel = 'internal', maxResults = 100 } = options;
  
  const marketKey = determineMarketKey(lead);
  if (!marketKey) {
    return [];
  }
  
  // Get all buyers for this market
  const buyerMarkets = { $in: [marketKey] };
  const buyers = await Buyer.find({
    $or: [
      { preferredMarkets: buyerMarkets },
      { markets: buyerMarkets } // Fallback to legacy markets field
    ]
  });
  
  // Match and rank buyers
  const matches = [];
  const excluded = [];
  
  for (const buyer of buyers) {
    const matchResult = checkBuyerMatch(buyer, lead, channel);
    const score = calculateBuyerScore(buyer, lead, matchResult);
    
    if (matchResult.excluded) {
      excluded.push({
        buyer: {
          _id: buyer._id,
          name: buyer.name,
          entityName: buyer.entityName
        },
        score: 0,
        reasons: [],
        excluded: true,
        exclusionReason: matchResult.exclusionReason
      });
    } else if (matchResult.matched) {
      matches.push({
        buyer: buyer.toObject(),
        score,
        reasons: matchResult.reasons,
        excluded: false,
        exclusionReason: null
      });
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Return top matches + excluded (for transparency)
  const result = matches.slice(0, maxResults);
  
  // Add excluded buyers (limited to first 20 for performance)
  if (excluded.length > 0) {
    result.push(...excluded.slice(0, 20));
  }
  
  return result;
}

module.exports = {
  matchBuyersForLead,
  checkBuyerMatch,
  calculateBuyerScore,
  determineMarketKey
};
