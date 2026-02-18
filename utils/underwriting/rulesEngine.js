// utils/underwriting/rulesEngine.js
// Rules-based underwriting engine (always available, no AI required)

const BuyBox = require('../../models/BuyBox');

/**
 * Analyze lead using buy box rules and lead data
 * Returns underwriting analysis without AI
 */
async function analyzeWithRules(lead) {
  const result = {
    summaryText: '',
    suggestedLane: 'unknown',
    suggestedPriceRange: { min: null, max: null },
    assumptions: [],
    missingFields: [],
    risks: [],
    aiUsed: false,
    model: 'rules-only'
  };

  // Get buy box if available
  let buyBox = null;
  if (lead.leadScore?.buyBoxId) {
    buyBox = await BuyBox.findById(lead.leadScore.buyBoxId);
  }

  // Analyze condition tier
  const conditionTier = lead.dialerIntake?.conditionTier || lead.conditionTier;
  const occupancyType = lead.dialerIntake?.occupancyType || lead.occupancyType;
  const motivationRating = lead.dialerIntake?.motivationRating || lead.motivationRating || 0;

  // Check missing fields
  if (!conditionTier) result.missingFields.push('conditionTier');
  if (!occupancyType) result.missingFields.push('occupancyType');
  if (!lead.dialerIntake?.propertyAddress) result.missingFields.push('propertyAddress');
  if (!lead.dialerIntake?.mortgageFreeAndClear) result.missingFields.push('mortgageFreeAndClear');
  if (!lead.dialerIntake?.motivationRating) result.missingFields.push('motivationRating');
  if (!lead.dialerIntake?.sellerReason) result.missingFields.push('sellerReason');

  // Analyze risks
  if (lead.dialerIntake?.redFlags && lead.dialerIntake.redFlags.length > 0) {
    result.risks.push(...lead.dialerIntake.redFlags);
  }
  if (conditionTier === 'heavy' || conditionTier === '5' || conditionTier === '4') {
    result.risks.push('Heavy rehab required');
  }
  if (occupancyType === 'tenant') {
    result.risks.push('Tenant occupied - may require eviction');
  }
  if (lead.dialerIntake?.mortgageFreeAndClear === 'no' && !lead.dialerIntake?.mortgageBalance) {
    result.risks.push('Unknown mortgage balance');
  }

  // Suggest lane based on buy box and lead data
  if (buyBox) {
    const buyBoxType = buyBox.buyerType;
    if (buyBoxType === 'fix_and_flip') {
      result.suggestedLane = 'cash';
    } else if (buyBoxType === 'buy_and_hold') {
      if (lead.dialerIntake?.mortgageFreeAndClear === 'no' && lead.dialerIntake?.mortgageCurrent === 'yes') {
        result.suggestedLane = 'subto';
      } else {
        result.suggestedLane = 'cash';
      }
    } else if (buyBoxType === 'commercial') {
      result.suggestedLane = 'cash';
    }
  }

  // Suggest price range based on buy box and ARV
  if (buyBox && lead.arv) {
    const maxOfferPercent = buyBox.maxOfferPercent || 70;
    const minOfferPercent = buyBox.minOfferPercent || 50;
    result.suggestedPriceRange = {
      min: Math.round(lead.arv * (minOfferPercent / 100)),
      max: Math.round(lead.arv * (maxOfferPercent / 100))
    };
    result.assumptions.push(`Based on ARV of $${lead.arv.toLocaleString()} and buy box range ${minOfferPercent}-${maxOfferPercent}%`);
  } else if (lead.askingPrice) {
    // Use asking price as reference
    result.suggestedPriceRange = {
      min: Math.round(lead.askingPrice * 0.6),
      max: Math.round(lead.askingPrice * 0.85)
    };
    result.assumptions.push(`Based on asking price of $${lead.askingPrice.toLocaleString()}`);
  }

  // Build summary text
  const summaryParts = [];
  if (buyBox) {
    summaryParts.push(`Buy Box: ${buyBox.label || buyBox.marketKey}`);
  }
  if (lead.leadScore?.grade) {
    summaryParts.push(`Grade: ${lead.leadScore.grade}`);
  }
  if (result.suggestedLane !== 'unknown') {
    summaryParts.push(`Suggested Lane: ${result.suggestedLane}`);
  }
  if (result.suggestedPriceRange.min && result.suggestedPriceRange.max) {
    summaryParts.push(`Price Range: $${result.suggestedPriceRange.min.toLocaleString()} - $${result.suggestedPriceRange.max.toLocaleString()}`);
  }
  if (result.risks.length > 0) {
    summaryParts.push(`Risks: ${result.risks.length} identified`);
  }
  if (result.missingFields.length > 0) {
    summaryParts.push(`Missing: ${result.missingFields.length} fields`);
  }

  result.summaryText = summaryParts.join(' | ');

  return result;
}

module.exports = {
  analyzeWithRules
};

