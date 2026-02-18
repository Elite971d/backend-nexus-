// utils/offerLaneClassifier.js
// Rules engine for classifying recommended offer lanes based on intake data

/**
 * Classifies the recommended offer lane based on intake data
 * @param {Object} intake - Dialer intake object
 * @returns {Object} { suggestion, reasons, missingFields }
 */
function classifyOfferLane(intake) {
  const missingFields = [];
  const reasons = [];

  // Check required fields
  if (!intake.mortgageFreeAndClear || intake.mortgageFreeAndClear === 'unknown') {
    missingFields.push('mortgageFreeAndClear');
  }
  if (!intake.mortgageCurrent || intake.mortgageCurrent === 'unknown') {
    missingFields.push('mortgageCurrent');
  }
  if (!intake.sellerFlexibility || intake.sellerFlexibility === 'unknown') {
    missingFields.push('sellerFlexibility');
  }
  if (!intake.motivationRating) {
    missingFields.push('motivationRating');
  }

  // If critical fields are missing, return needs_more_info
  if (missingFields.length > 0) {
    return {
      suggestion: 'unknown',
      reasons: ['Insufficient data - missing required fields'],
      missingFields
    };
  }

  const freeAndClear = intake.mortgageFreeAndClear === 'yes';
  const mortgageCurrent = intake.mortgageCurrent === 'yes';
  const mortgageBalance = intake.mortgageBalance || 0;
  const askingPrice = intake.askingPrice || 0;
  const equity = askingPrice > 0 ? askingPrice - mortgageBalance : 0;
  const equityPercent = askingPrice > 0 ? (equity / askingPrice) * 100 : 0;
  const flexibility = intake.sellerFlexibility;
  const motivation = intake.motivationRating || 0;
  const conditionTier = intake.conditionTier;

  // Rule 1: Free and Clear -> Seller Finance
  if (freeAndClear) {
    reasons.push('Property is free and clear - ideal for seller finance');
    return {
      suggestion: 'sellerfinance',
      reasons,
      missingFields: []
    };
  }

  // Rule 2: Low equity / Little equity -> Sub-To
  if (!freeAndClear && equityPercent < 20) {
    reasons.push(`Low equity (${equityPercent.toFixed(1)}%) - Sub-To recommended`);
    return {
      suggestion: 'subto',
      reasons,
      missingFields: []
    };
  }

  // Rule 3: Wants retail / Not flexible on terms -> Novation
  if (flexibility === 'price' && motivation < 3) {
    reasons.push('Seller wants retail price, not flexible on terms - Novation option');
    return {
      suggestion: 'novation',
      reasons,
      missingFields: []
    };
  }

  // Rule 4: Needs speed / Distressed -> Cash
  if (motivation >= 4 && (conditionTier === 'heavy' || conditionTier === '5' || conditionTier === '4')) {
    reasons.push('High motivation + distressed condition - Cash offer for speed');
    return {
      suggestion: 'cash',
      reasons,
      missingFields: []
    };
  }

  // Rule 5: Rental-ready / Open to terms -> Lease Option
  if (flexibility === 'terms' || flexibility === 'both') {
    if (intake.occupancyType === 'tenant' || intake.occupancyType === 'vacant') {
      reasons.push('Property is rental-ready and seller open to terms - Lease Option');
      return {
        suggestion: 'leaseoption',
        reasons,
        missingFields: []
      };
    }
  }

  // Rule 6: Default to Sub-To if mortgage exists and current
  if (!freeAndClear && mortgageCurrent && equityPercent < 50) {
    reasons.push('Mortgage exists and current with moderate equity - Sub-To recommended');
    return {
      suggestion: 'subto',
      reasons,
      missingFields: []
    };
  }

  // Default fallback
  return {
    suggestion: 'unknown',
    reasons: ['Insufficient criteria to determine optimal lane'],
    missingFields: missingFields.length > 0 ? missingFields : ['Additional seller information needed']
  };
}

module.exports = {
  classifyOfferLane
};
