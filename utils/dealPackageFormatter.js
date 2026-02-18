// utils/dealPackageFormatter.js
/**
 * Formats deal information into standardized "deal card" payloads
 * Supports both "redacted" (for initial blast) and "full" (after interest confirmed) versions
 */

/**
 * Mask street number in address (for redacted version)
 * @param {string} address - Full address
 * @returns {string} Masked address (e.g., "123 Main St" -> "*** Main St")
 */
function maskStreetNumber(address) {
  if (!address) return 'Address TBD';
  // Match street number at start of address
  return address.replace(/^\d+/, '***');
}

/**
 * Format deal package (redacted or full)
 * @param {Object} lead - Lead document
 * @param {Object} options - { redacted: boolean, includeTargetPrice: boolean }
 * @returns {Object} Deal package object
 */
function formatDealPackage(lead, options = {}) {
  const { redacted = false, includeTargetPrice = false } = options;
  
  // Extract lead data
  const address = lead.dialerIntake?.propertyAddress || lead.propertyAddress;
  const city = lead.city || '';
  const state = lead.state || '';
  const zip = lead.zip || '';
  const beds = lead.dialerIntake?.beds || lead.beds;
  const baths = lead.dialerIntake?.baths || lead.baths;
  const sqft = lead.dialerIntake?.sqft || lead.sqft;
  const yearBuilt = lead.dialerIntake?.yearBuilt || lead.yearBuilt;
  const conditionTier = lead.dialerIntake?.conditionTier || 'unknown';
  const askingPrice = lead.dialerIntake?.askingPrice || lead.askingPrice;
  const arv = lead.arv;
  const propertyType = lead.dialerIntake?.propertyType || lead.propertyType;
  
  // Get buy box info if available
  const buyBoxLabel = lead.leadScore?.buyBoxLabel || null;
  const grade = lead.leadScore?.grade || 'Dead';
  const score = lead.leadScore?.score || 0;
  
  // Format address (mask if redacted)
  const formattedAddress = redacted ? maskStreetNumber(address) : address;
  
  // Build deal package
  const dealPackage = {
    // Basic property info
    address: formattedAddress,
    city,
    state,
    zip,
    fullAddress: redacted ? `${formattedAddress}, ${city}, ${state} ${zip}`.trim() : `${address}, ${city}, ${state} ${zip}`.trim(),
    
    // Property details
    propertyType: propertyType || 'Unknown',
    beds: beds || null,
    baths: baths || null,
    sqft: sqft || null,
    yearBuilt: yearBuilt || null,
    conditionTier: conditionTier || 'unknown',
    
    // Pricing
    askingPrice: askingPrice || null,
    arv: arv || null,
    
    // Scoring & buy box
    grade: grade,
    score: score,
    buyBoxLabel: buyBoxLabel,
    
    // Strategy lane suggestion (if available)
    recommendedLane: lead.dialerIntake?.recommendedOfferLane || null,
    
    // Access / next steps
    access: lead.lockboxCode ? `Lockbox code: ${lead.lockboxCode}` : 'Contact for access',
    nextSteps: 'Contact closer for full details and viewing',
    
    // Disclaimer
    disclaimer: 'Information provided is preliminary and subject to verification. No guarantees are made regarding property condition, pricing, or availability. All information must be independently verified before making any purchase decision.',
    
    // Metadata
    leadId: lead._id.toString(),
    marketKey: lead.metadata?.marketKey || null,
    createdAt: lead.createdAt
  };
  
  // Add target price guidance (closer-only, never shown to dialers or buyers)
  if (includeTargetPrice && lead.closer?.offerAmount) {
    dealPackage.targetPriceGuidance = {
      suggestedOffer: lead.closer.offerAmount,
      offerLane: lead.closer.offerLaneFinal,
      notes: 'Closer-only field - never expose to dialers or buyers'
    };
  }
  
  // Add redacted flag
  if (redacted) {
    dealPackage.redacted = true;
    dealPackage.note = 'Full address and additional details available upon interest confirmation';
  }
  
  return dealPackage;
}

/**
 * Format deal package as text (for SMS/email templates)
 * @param {Object} lead - Lead document
 * @param {Object} options - { redacted: boolean }
 * @returns {string} Formatted text
 */
function formatDealPackageAsText(lead, options = {}) {
  const { redacted = false } = options;
  const pkg = formatDealPackage(lead, { redacted });
  
  let text = `🏠 NEW DEAL OPPORTUNITY\n\n`;
  
  text += `📍 ${pkg.fullAddress}\n`;
  text += `🏘️ ${pkg.propertyType}`;
  if (pkg.beds) text += ` | ${pkg.beds} bed`;
  if (pkg.baths) text += ` | ${pkg.baths} bath`;
  if (pkg.sqft) text += ` | ${pkg.sqft} sqft`;
  text += `\n`;
  
  if (pkg.yearBuilt) {
    text += `📅 Built: ${pkg.yearBuilt}\n`;
  }
  
  text += `🔧 Condition: ${pkg.conditionTier}\n`;
  
  if (pkg.askingPrice) {
    text += `💰 Asking: $${pkg.askingPrice.toLocaleString()}\n`;
  }
  
  if (pkg.arv) {
    text += `📊 ARV: $${pkg.arv.toLocaleString()}\n`;
  }
  
  if (pkg.grade && pkg.grade !== 'Dead') {
    text += `⭐ Grade: ${pkg.grade} (Score: ${pkg.score})\n`;
  }
  
  if (pkg.buyBoxLabel) {
    text += `📦 Buy Box: ${pkg.buyBoxLabel}\n`;
  }
  
  if (pkg.recommendedLane) {
    text += `🎯 Strategy: ${pkg.recommendedLane}\n`;
  }
  
  text += `\n${pkg.access}\n`;
  text += `\n${pkg.disclaimer}\n`;
  
  if (redacted) {
    text += `\n⚠️ Full details available upon interest confirmation`;
  }
  
  return text;
}

/**
 * Format deal package as HTML (for email templates)
 * @param {Object} lead - Lead document
 * @param {Object} options - { redacted: boolean }
 * @returns {string} Formatted HTML
 */
function formatDealPackageAsHTML(lead, options = {}) {
  const { redacted = false } = options;
  const pkg = formatDealPackage(lead, { redacted });
  
  let html = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">`;
  html += `<h2 style="color: #333;">🏠 New Deal Opportunity</h2>`;
  html += `<div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">`;
  
  html += `<p><strong>📍 Address:</strong> ${pkg.fullAddress}</p>`;
  html += `<p><strong>🏘️ Property Type:</strong> ${pkg.propertyType}`;
  if (pkg.beds) html += ` | <strong>Beds:</strong> ${pkg.beds}`;
  if (pkg.baths) html += ` | <strong>Baths:</strong> ${pkg.baths}`;
  if (pkg.sqft) html += ` | <strong>Sqft:</strong> ${pkg.sqft}`;
  html += `</p>`;
  
  if (pkg.yearBuilt) {
    html += `<p><strong>📅 Year Built:</strong> ${pkg.yearBuilt}</p>`;
  }
  
  html += `<p><strong>🔧 Condition:</strong> ${pkg.conditionTier}</p>`;
  
  if (pkg.askingPrice) {
    html += `<p><strong>💰 Asking Price:</strong> $${pkg.askingPrice.toLocaleString()}</p>`;
  }
  
  if (pkg.arv) {
    html += `<p><strong>📊 ARV:</strong> $${pkg.arv.toLocaleString()}</p>`;
  }
  
  if (pkg.grade && pkg.grade !== 'Dead') {
    html += `<p><strong>⭐ Grade:</strong> ${pkg.grade} (Score: ${pkg.score})</p>`;
  }
  
  if (pkg.buyBoxLabel) {
    html += `<p><strong>📦 Buy Box:</strong> ${pkg.buyBoxLabel}</p>`;
  }
  
  if (pkg.recommendedLane) {
    html += `<p><strong>🎯 Strategy:</strong> ${pkg.recommendedLane}</p>`;
  }
  
  html += `<p><strong>🔑 Access:</strong> ${pkg.access}</p>`;
  html += `</div>`;
  
  html += `<p style="font-size: 12px; color: #666; margin-top: 20px;">${pkg.disclaimer}</p>`;
  
  if (redacted) {
    html += `<p style="color: #ff6600; font-weight: bold;">⚠️ Full details available upon interest confirmation</p>`;
  }
  
  html += `</div>`;
  
  return html;
}

module.exports = {
  formatDealPackage,
  formatDealPackageAsText,
  formatDealPackageAsHTML,
  maskStreetNumber
};

