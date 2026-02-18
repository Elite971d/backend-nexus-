// utils/handoffGenerator.js
// Generates structured handoff summary with zero information loss

/**
 * Generates a comprehensive handoff summary from lead and intake data
 * @param {Object} lead - Lead document
 * @param {Object} intake - Dialer intake data
 * @returns {Object} { summary, missingFields }
 */
function generateHandoffSummary(lead, intake) {
  const sections = [];
  const missingFields = [];

  // Property Snapshot
  const propertySection = [];
  propertySection.push('=== PROPERTY SNAPSHOT ===');
  propertySection.push(`Address: ${intake.propertyAddress || lead.propertyAddress || 'N/A'}`);
  propertySection.push(`Type: ${intake.propertyType || 'N/A'}`);
  propertySection.push(`Occupancy: ${intake.occupancyType || 'N/A'}`);
  propertySection.push(`Condition: ${intake.conditionTier || 'N/A'}`);
  if (lead.beds) propertySection.push(`Beds: ${lead.beds}`);
  if (lead.baths) propertySection.push(`Baths: ${lead.baths}`);
  if (lead.sqft) propertySection.push(`Sqft: ${lead.sqft}`);
  sections.push(propertySection.join('\n'));

  // Financial Snapshot
  const financialSection = [];
  financialSection.push('\n=== FINANCIAL SNAPSHOT ===');
  financialSection.push(`Asking Price: ${intake.askingPrice ? '$' + intake.askingPrice.toLocaleString() : 'N/A'}`);
  financialSection.push(`Free & Clear: ${intake.mortgageFreeAndClear || 'N/A'}`);
  if (intake.mortgageBalance) {
    financialSection.push(`Mortgage Balance: $${intake.mortgageBalance.toLocaleString()}`);
  }
  if (intake.mortgageMonthlyPayment) {
    financialSection.push(`Monthly Payment: $${intake.mortgageMonthlyPayment.toLocaleString()}`);
  }
  financialSection.push(`Mortgage Current: ${intake.mortgageCurrent || 'N/A'}`);
  sections.push(financialSection.join('\n'));

  // Seller Psychology
  const psychologySection = [];
  psychologySection.push('\n=== SELLER PSYCHOLOGY ===');
  psychologySection.push(`Motivation Rating: ${intake.motivationRating || 'N/A'}/5`);
  psychologySection.push(`Timeline: ${intake.timelineToClose || 'N/A'}`);
  psychologySection.push(`Reason: ${intake.sellerReason || 'N/A'}`);
  psychologySection.push(`Flexibility: ${intake.sellerFlexibility || 'N/A'}`);
  sections.push(psychologySection.join('\n'));

  // Dialer Recommendation
  if (intake.recommendedOfferLane && intake.recommendedOfferLane !== 'unknown') {
    const recommendationSection = [];
    recommendationSection.push('\n=== DIALER RECOMMENDATION ===');
    recommendationSection.push(`Recommended Lane: ${intake.recommendedOfferLane.toUpperCase()}`);
    recommendationSection.push(`Confidence: ${intake.dialerConfidence || 'N/A'}/5`);
    sections.push(recommendationSection.join('\n'));
  }

  // Red Flags
  if (intake.redFlags && intake.redFlags.length > 0) {
    const redFlagsSection = [];
    redFlagsSection.push('\n=== RED FLAGS ===');
    intake.redFlags.forEach(flag => {
      redFlagsSection.push(`- ${flag}`);
    });
    sections.push(redFlagsSection.join('\n'));
  }

  // Check for missing required fields
  const requiredFields = [
    { key: 'propertyAddress', label: 'Property Address' },
    { key: 'occupancyType', label: 'Occupancy Type' },
    { key: 'conditionTier', label: 'Condition Tier' },
    { key: 'mortgageFreeAndClear', label: 'Mortgage Free & Clear' },
    { key: 'mortgageCurrent', label: 'Mortgage Current Status' },
    { key: 'motivationRating', label: 'Motivation Rating' },
    { key: 'timelineToClose', label: 'Timeline to Close' },
    { key: 'sellerReason', label: 'Seller Reason' },
    { key: 'sellerFlexibility', label: 'Seller Flexibility' }
  ];

  requiredFields.forEach(field => {
    const value = intake[field.key];
    if (!value || value === 'unknown' || value === '') {
      missingFields.push(field.label);
    }
  });

  // Additional Notes
  if (lead.notes) {
    sections.push(`\n=== ADDITIONAL NOTES ===\n${lead.notes}`);
  }

  const summary = sections.join('\n\n');

  return {
    summary,
    missingFields
  };
}

module.exports = {
  generateHandoffSummary
};
