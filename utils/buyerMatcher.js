// utils/buyerMatcher.js
/**
 * Buyer Matching Engine
 * Matches a Lead to a Buyer based on criteria
 * Returns match score (0-100), match reasons, and isMatch boolean
 */

/**
 * Normalize property type for matching
 */
function normalizePropertyType(propertyType) {
  if (!propertyType) return null;
  const pt = String(propertyType).toUpperCase();
  if (pt.includes('SFR') || pt.includes('SINGLE') || pt.includes('SFH') || pt === 'SFR') {
    return 'SFR';
  } else if (pt.includes('MULTI') || pt.includes('MF') || pt === 'MF' || pt === 'MULTI') {
    return 'Multi';
  } else if (pt.includes('LAND') || pt === 'LAND') {
    return 'LAND';
  } else if (pt.includes('COMMERCIAL') || pt === 'COMMERCIAL') {
    return 'COMMERCIAL';
  }
  return null;
}

/**
 * Normalize condition for matching
 */
function normalizeCondition(condition) {
  if (!condition) return null;
  const cond = String(condition).toLowerCase();
  if (cond.includes('light') || cond === '1' || cond === '2') return 'light';
  if (cond.includes('medium') || cond === '3') return 'medium';
  if (cond.includes('heavy') || cond === '4' || cond === '5') return 'heavy';
  return null;
}

/**
 * Check if county matches
 */
function countyMatches(leadCounty, buyerCounties) {
  if (!leadCounty || !buyerCounties || buyerCounties.length === 0) return false;
  const normalizedLeadCounty = String(leadCounty).trim().toLowerCase();
  return buyerCounties.some(c => String(c).trim().toLowerCase() === normalizedLeadCounty);
}

/**
 * Check if state matches
 */
function stateMatches(leadState, buyerStates) {
  if (!leadState || !buyerStates || buyerStates.length === 0) return false;
  const normalizedLeadState = String(leadState).trim().toUpperCase();
  return buyerStates.some(s => String(s).trim().toUpperCase() === normalizedLeadState);
}

/**
 * Check if property type is compatible
 */
function propertyTypeCompatible(leadPropertyType, buyerPropertyTypes) {
  if (!leadPropertyType || !buyerPropertyTypes || buyerPropertyTypes.length === 0) return false;
  const normalizedLead = normalizePropertyType(leadPropertyType);
  if (!normalizedLead) return false;
  
  // Check both uppercase and lowercase variants
  return buyerPropertyTypes.some(pt => {
    const normalizedBuyer = normalizePropertyType(pt);
    return normalizedBuyer === normalizedLead;
  });
}

/**
 * Match a Lead to a Buyer
 * @param {Object} lead - Lead document
 * @param {Object} buyer - Buyer document
 * @param {Number} threshold - Minimum score to be considered a match (default: 70)
 * @returns {Object} { matchScore, matchReasons, isMatch }
 */
function matchBuyerToLead(lead, buyer, threshold = 70) {
  let matchScore = 0;
  const matchReasons = [];
  const failedChecks = [];

  // Must be active buyer
  if (!buyer.active) {
    return {
      matchScore: 0,
      matchReasons: [],
      isMatch: false,
      failedChecks: ['Buyer is inactive']
    };
  }

  // Extract lead data
  const leadCounty = lead.county || lead.dialerIntake?.county;
  const leadState = lead.state || lead.dialerIntake?.state;
  const leadPrice = lead.askingPrice || lead.listPrice || lead.dialerIntake?.askingPrice;
  const leadPropertyType = lead.dialerIntake?.propertyType || lead.propertyType;
  const leadBeds = lead.beds || lead.dialerIntake?.beds;
  const leadBaths = lead.baths || lead.dialerIntake?.baths;
  const leadSqft = lead.sqft || lead.dialerIntake?.sqft;
  const leadYearBuilt = lead.yearBuilt || lead.dialerIntake?.yearBuilt;
  const leadCondition = lead.dialerIntake?.conditionTier || lead.conditionTier;
  const leadDealType = lead.closer?.offerLaneFinal || 'cash'; // Default to cash

  // 1. County/State Match (REQUIRED - 25 points)
  let locationMatch = false;
  if (buyer.counties && buyer.counties.length > 0) {
    if (countyMatches(leadCounty, buyer.counties)) {
      matchScore += 25;
      matchReasons.push(`County match: ${leadCounty}`);
      locationMatch = true;
    } else {
      failedChecks.push(`County mismatch: ${leadCounty} not in buyer counties`);
    }
  } else if (buyer.states && buyer.states.length > 0) {
    if (stateMatches(leadState, buyer.states)) {
      matchScore += 20; // Slightly less for state-only match
      matchReasons.push(`State match: ${leadState}`);
      locationMatch = true;
    } else {
      failedChecks.push(`State mismatch: ${leadState} not in buyer states`);
    }
  } else if (buyer.preferredCounties && buyer.preferredCounties.length > 0) {
    if (countyMatches(leadCounty, buyer.preferredCounties)) {
      matchScore += 25;
      matchReasons.push(`Preferred county match: ${leadCounty}`);
      locationMatch = true;
    }
  }

  if (!locationMatch) {
    // Location is required - return early if no match
    return {
      matchScore: 0,
      matchReasons: [],
      isMatch: false,
      failedChecks: ['No location match (county/state required)']
    };
  }

  // 2. Price Range Match (20 points)
  if (leadPrice && buyer.minPrice !== undefined && buyer.maxPrice !== undefined) {
    if (leadPrice >= buyer.minPrice && leadPrice <= buyer.maxPrice) {
      matchScore += 20;
      matchReasons.push(`Price in range: $${leadPrice.toLocaleString()} (${buyer.minPrice.toLocaleString()}-${buyer.maxPrice.toLocaleString()})`);
    } else {
      failedChecks.push(`Price out of range: $${leadPrice.toLocaleString()} (buyer wants ${buyer.minPrice.toLocaleString()}-${buyer.maxPrice.toLocaleString()})`);
    }
  } else if (buyer.maxBuyPrice && leadPrice) {
    // Fallback to maxBuyPrice for backward compatibility
    if (leadPrice <= buyer.maxBuyPrice) {
      matchScore += 15;
      matchReasons.push(`Price within max: $${leadPrice.toLocaleString()} (max: ${buyer.maxBuyPrice.toLocaleString()})`);
    } else {
      failedChecks.push(`Price exceeds max: $${leadPrice.toLocaleString()} (max: ${buyer.maxBuyPrice.toLocaleString()})`);
    }
  }

  // 3. Property Type Match (15 points)
  if (propertyTypeCompatible(leadPropertyType, buyer.propertyTypes)) {
    matchScore += 15;
    matchReasons.push(`Property type match: ${normalizePropertyType(leadPropertyType)}`);
  } else if (leadPropertyType) {
    failedChecks.push(`Property type mismatch: ${leadPropertyType} not in buyer types`);
  }

  // 4. Beds/Baths Match (10 points)
  let bedsBathsMatch = true;
  if (buyer.minBeds && leadBeds) {
    if (leadBeds >= buyer.minBeds) {
      matchScore += 5;
      matchReasons.push(`Beds match: ${leadBeds} >= ${buyer.minBeds}`);
    } else {
      bedsBathsMatch = false;
      failedChecks.push(`Beds insufficient: ${leadBeds} < ${buyer.minBeds}`);
    }
  }
  if (buyer.minBaths && leadBaths) {
    if (leadBaths >= buyer.minBaths) {
      matchScore += 5;
      matchReasons.push(`Baths match: ${leadBaths} >= ${buyer.minBaths}`);
    } else {
      bedsBathsMatch = false;
      failedChecks.push(`Baths insufficient: ${leadBaths} < ${buyer.minBaths}`);
    }
  }

  // 5. SqFt Match (10 points)
  if (buyer.minSqft && leadSqft) {
    if (leadSqft >= buyer.minSqft) {
      matchScore += 10;
      matchReasons.push(`SqFt match: ${leadSqft.toLocaleString()} >= ${buyer.minSqft.toLocaleString()}`);
    } else {
      failedChecks.push(`SqFt insufficient: ${leadSqft.toLocaleString()} < ${buyer.minSqft.toLocaleString()}`);
    }
  }

  // 6. Year Built Match (5 points)
  if (buyer.yearBuiltMin && leadYearBuilt) {
    if (leadYearBuilt >= buyer.yearBuiltMin) {
      matchScore += 5;
      matchReasons.push(`Year built match: ${leadYearBuilt} >= ${buyer.yearBuiltMin}`);
    } else {
      failedChecks.push(`Year built too old: ${leadYearBuilt} < ${buyer.yearBuiltMin}`);
    }
  } else if (buyer.minYearBuilt && leadYearBuilt) {
    // Fallback to minYearBuilt
    if (leadYearBuilt >= buyer.minYearBuilt) {
      matchScore += 5;
      matchReasons.push(`Year built match: ${leadYearBuilt} >= ${buyer.minYearBuilt}`);
    }
  }

  // 7. Condition Tolerance Match (10 points)
  const normalizedLeadCondition = normalizeCondition(leadCondition);
  if (buyer.conditionTolerance && normalizedLeadCondition) {
    const toleranceOrder = { 'light': 1, 'medium': 2, 'heavy': 3 };
    const leadTolerance = toleranceOrder[normalizedLeadCondition] || 2;
    const buyerTolerance = toleranceOrder[buyer.conditionTolerance] || 2;
    
    if (leadTolerance <= buyerTolerance) {
      matchScore += 10;
      matchReasons.push(`Condition within tolerance: ${normalizedLeadCondition} (buyer accepts up to ${buyer.conditionTolerance})`);
    } else {
      failedChecks.push(`Condition exceeds tolerance: ${normalizedLeadCondition} (buyer accepts up to ${buyer.conditionTolerance})`);
    }
  } else if (buyer.maxRehabLevel && normalizedLeadCondition) {
    // Fallback to maxRehabLevel
    const toleranceOrder = { 'light': 1, 'medium': 2, 'heavy': 3 };
    const leadTolerance = toleranceOrder[normalizedLeadCondition] || 2;
    const buyerTolerance = toleranceOrder[buyer.maxRehabLevel] || 2;
    
    if (leadTolerance <= buyerTolerance) {
      matchScore += 10;
      matchReasons.push(`Condition within tolerance: ${normalizedLeadCondition}`);
    }
  }

  // 8. Deal Type Match (5 points)
  if (buyer.dealTypes && buyer.dealTypes.length > 0) {
    // Normalize deal types
    const normalizedDealType = leadDealType === 'subto' ? 'subto' : 
                               leadDealType === 'novation' ? 'novation' :
                               leadDealType === 'seller_finance' || leadDealType === 'sellerfinance' ? 'seller_finance' :
                               'cash';
    
    if (buyer.dealTypes.includes(normalizedDealType)) {
      matchScore += 5;
      matchReasons.push(`Deal type match: ${normalizedDealType}`);
    } else {
      failedChecks.push(`Deal type mismatch: ${normalizedDealType} not in buyer deal types`);
    }
  }

  // Bonus points
  // Cash ready + proof of funds (5 points)
  if (buyer.cashReady && buyer.proofOfFunds) {
    matchScore += 5;
    matchReasons.push('Cash ready with proof of funds');
  } else if (buyer.cashReady) {
    matchScore += 2;
    matchReasons.push('Cash ready');
  }

  // Clamp score to 0-100
  matchScore = Math.min(100, Math.max(0, matchScore));

  const isMatch = matchScore >= threshold;

  return {
    matchScore: Math.round(matchScore),
    matchReasons,
    isMatch,
    failedChecks: failedChecks.length > 0 ? failedChecks : undefined
  };
}

module.exports = {
  matchBuyerToLead,
  normalizePropertyType,
  normalizeCondition
};

