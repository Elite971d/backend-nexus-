// utils/scraperLeadNormalizer.js
// Normalizes scraper raw data into Lead model format

const { upsertLeadFromSource } = require('./leadUpsert');
const { recalculateAndSaveLeadScore } = require('./leadScoringEngine');

/**
 * Normalizes a preforeclosure record into a Lead
 */
async function normalizePreforeclosureToLead(preforeclosureRecord) {
  try {
    // Extract address components
    const addressParts = parseAddress(preforeclosureRecord.propertyAddress);
    
    // Parse delinquent amount (remove $ and commas)
    const delinquentAmount = parseAmount(preforeclosureRecord.amountDelinquent);
    
    const leadPayload = {
      source: 'preforeclosure',
      category: 'Pre-Foreclosure',
      ownerName: preforeclosureRecord.ownerName,
      propertyAddress: preforeclosureRecord.propertyAddress,
      mailingAddress: preforeclosureRecord.mailingAddress || preforeclosureRecord.propertyAddress,
      city: addressParts.city,
      state: addressParts.state || 'TX',
      zip: addressParts.zip,
      county: preforeclosureRecord.county,
      delinquentAmount: delinquentAmount,
      status: 'new',
      tags: [
        'preforeclosure',
        preforeclosureRecord.county ? preforeclosureRecord.county.toLowerCase().replace(/\s+/g, '_') : 'unknown_county'
      ],
      createdFrom: 'scraper'
    };
    
    const { lead, isNew } = await upsertLeadFromSource('county_scraper', leadPayload);
    
    // Auto-score the lead
    if (isNew) {
      try {
        await recalculateAndSaveLeadScore(lead);
      } catch (scoreErr) {
        console.error(`[NORMALIZER] Failed to score preforeclosure lead ${lead._id}:`, scoreErr.message);
      }
    }
    
    return { lead, isNew };
  } catch (err) {
    console.error('[NORMALIZER] Error normalizing preforeclosure:', err);
    throw err;
  }
}

/**
 * Normalizes a tax lien record into a Lead
 */
async function normalizeTaxLienToLead(taxLienRecord) {
  try {
    const addressParts = parseAddress(taxLienRecord.propertyAddress);
    const delinquentAmount = parseAmount(taxLienRecord.delinquentAmount);
    
    const leadPayload = {
      source: 'tax_lien',
      category: 'Tax Lien',
      ownerName: taxLienRecord.ownerName,
      propertyAddress: taxLienRecord.propertyAddress,
      mailingAddress: taxLienRecord.propertyAddress, // Tax liens typically don't have separate mailing
      city: addressParts.city,
      state: addressParts.state || 'TX',
      zip: addressParts.zip,
      county: taxLienRecord.county,
      delinquentAmount: delinquentAmount,
      status: 'new',
      tags: [
        'tax_lien',
        taxLienRecord.county ? taxLienRecord.county.toLowerCase().replace(/\s+/g, '_') : 'unknown_county'
      ],
      createdFrom: 'scraper'
    };
    
    const { lead, isNew } = await upsertLeadFromSource('county_scraper', leadPayload);
    
    if (isNew) {
      try {
        await recalculateAndSaveLeadScore(lead);
      } catch (scoreErr) {
        console.error(`[NORMALIZER] Failed to score tax lien lead ${lead._id}:`, scoreErr.message);
      }
    }
    
    return { lead, isNew };
  } catch (err) {
    console.error('[NORMALIZER] Error normalizing tax lien:', err);
    throw err;
  }
}

/**
 * Normalizes a code violation record into a Lead
 */
async function normalizeCodeViolationToLead(codeViolationRecord) {
  try {
    const addressParts = parseAddress(codeViolationRecord.propertyAddress);
    
    const leadPayload = {
      source: 'code_violation',
      category: 'Code Violation',
      ownerName: codeViolationRecord.ownerName,
      propertyAddress: codeViolationRecord.propertyAddress,
      mailingAddress: codeViolationRecord.propertyAddress,
      city: addressParts.city,
      state: addressParts.state || 'TX',
      zip: addressParts.zip,
      county: codeViolationRecord.county,
      caseNumber: codeViolationRecord.caseNumber,
      description: `Code Violation: ${codeViolationRecord.violationType || 'Unknown violation'}`,
      status: 'new',
      tags: [
        'code_violation',
        codeViolationRecord.county ? codeViolationRecord.county.toLowerCase().replace(/\s+/g, '_') : 'unknown_county'
      ],
      createdFrom: 'scraper'
    };
    
    const { lead, isNew } = await upsertLeadFromSource('county_scraper', leadPayload);
    
    if (isNew) {
      try {
        await recalculateAndSaveLeadScore(lead);
      } catch (scoreErr) {
        console.error(`[NORMALIZER] Failed to score code violation lead ${lead._id}:`, scoreErr.message);
      }
    }
    
    return { lead, isNew };
  } catch (err) {
    console.error('[NORMALIZER] Error normalizing code violation:', err);
    throw err;
  }
}

/**
 * Normalizes a probate record into a Lead
 */
async function normalizeProbateToLead(probateRecord) {
  try {
    const addressParts = parseAddress(probateRecord.estateAddress);
    
    const leadPayload = {
      source: 'probate',
      category: 'Probate',
      ownerName: probateRecord.executorName || 'Estate',
      propertyAddress: probateRecord.estateAddress,
      mailingAddress: probateRecord.estateAddress,
      city: addressParts.city,
      state: addressParts.state || 'TX',
      zip: addressParts.zip,
      county: probateRecord.county,
      caseNumber: probateRecord.caseNumber,
      description: `Probate Estate - Executor: ${probateRecord.executorName || 'Unknown'}, Attorney: ${probateRecord.attorneyName || 'Unknown'}`,
      status: 'new',
      tags: [
        'probate',
        probateRecord.county ? probateRecord.county.toLowerCase().replace(/\s+/g, '_') : 'unknown_county'
      ],
      createdFrom: 'scraper'
    };
    
    const { lead, isNew } = await upsertLeadFromSource('county_scraper', leadPayload);
    
    if (isNew) {
      try {
        await recalculateAndSaveLeadScore(lead);
      } catch (scoreErr) {
        console.error(`[NORMALIZER] Failed to score probate lead ${lead._id}:`, scoreErr.message);
      }
    }
    
    return { lead, isNew };
  } catch (err) {
    console.error('[NORMALIZER] Error normalizing probate:', err);
    throw err;
  }
}

/**
 * Parses an address string into components
 */
function parseAddress(addressString) {
  if (!addressString) {
    return { city: null, state: null, zip: null };
  }
  
  // Common format: "123 Main St, City, ST ZIP" or "123 Main St, City, ST  ZIP"
  const parts = addressString.split(',').map(p => p.trim());
  
  let city = null;
  let state = null;
  let zip = null;
  
  if (parts.length >= 2) {
    city = parts[parts.length - 2] || null;
    const lastPart = parts[parts.length - 1] || '';
    const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2];
    } else {
      // Try to extract just state
      const stateMatch = lastPart.match(/^([A-Z]{2})/);
      if (stateMatch) {
        state = stateMatch[1];
      }
    }
  }
  
  return { city, state, zip };
}

/**
 * Parses an amount string (removes $ and commas)
 */
function parseAmount(amountString) {
  if (!amountString) return null;
  const cleaned = amountString.replace(/[$,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

module.exports = {
  normalizePreforeclosureToLead,
  normalizeTaxLienToLead,
  normalizeCodeViolationToLead,
  normalizeProbateToLead
};

