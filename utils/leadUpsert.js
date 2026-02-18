// utils/leadUpsert.js
// Centralized lead upsert and deduplication logic

const Lead = require('../models/Lead');
const crypto = require('crypto');

/**
 * Builds a deterministic dedupeKey from lead data
 * @param {Object} payload - Lead data object
 * @param {String} sourceType - Source type (e.g., 'county_scraper', 'email_scraper')
 * @returns {String} - Deterministic dedupeKey
 */
function buildDedupeKey(payload, sourceType) {
  // Strategy 1: Use (county + caseNumber) when both are available
  if (payload.county && payload.caseNumber) {
    const normalized = `${payload.county.toLowerCase().trim()}|${payload.caseNumber.trim()}`;
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
  
  // Strategy 2: Use (propertyAddress + county) as primary uniqueness key (per requirements)
  // Fallback to (ownerName + propertyAddress + sourceType + date) if county not available
  const propertyAddress = (payload.propertyAddress || '').toLowerCase().trim();
  const county = (payload.county || '').toLowerCase().trim();
  
  if (propertyAddress && county) {
    // Primary strategy: propertyAddress + county (as per requirements)
    const normalized = `${propertyAddress}|${county}`;
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
  
  // Fallback: Use (ownerName + propertyAddress + sourceType + date field)
  const ownerName = (payload.ownerName || '').toLowerCase().trim();
  const dateField = payload.closingDate || payload.auctionDate || payload.createdAt || '';
  const dateStr = typeof dateField === 'string' ? dateField.trim() : String(dateField);
  
  const normalized = `${ownerName}|${propertyAddress}|${sourceType}|${dateStr}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Upserts a lead from a source, handling deduplication
 * @param {String} sourceType - Source type (e.g., 'county_scraper', 'email_scraper', 'manual', 'csv_upload')
 * @param {Object} payload - Lead data to upsert
 * @returns {Promise<{lead: Object, isNew: Boolean}>}
 */
async function upsertLeadFromSource(sourceType, payload) {
  try {
    // Build dedupeKey
    const dedupeKey = buildDedupeKey(payload, sourceType);
    
    // Prepare lead data with dedupeKey and sourceType
    const leadData = {
      ...payload,
      dedupeKey,
      createdFrom: sourceType,
      // Ensure source field is set
      source: payload.source || sourceType
    };
    
    // Find existing lead by dedupeKey (tenant-scoped if tenantId provided)
    const findFilter = { dedupeKey };
    if (payload.tenantId) {
      findFilter.tenantId = payload.tenantId;
    }
    let lead = await Lead.findOne(findFilter);
    
    if (lead) {
      // Update existing lead (preserve existing alertedAt, status, notes, etc.)
      // Only update fields that are provided and not null/undefined
      const updateData = {};
      Object.keys(leadData).forEach(key => {
        if (leadData[key] !== null && leadData[key] !== undefined && key !== 'dedupeKey') {
          // Don't overwrite CRM fields if they exist and new value is empty
          const crmFields = ['status', 'notes', 'tags', 'nextFollowUp', 'alertedAt'];
          if (crmFields.includes(key) && lead[key] && !leadData[key]) {
            return; // Skip update
          }
          updateData[key] = leadData[key];
        }
      });
      
      // Update the lead
      Object.assign(lead, updateData);
      await lead.save();
      
      return { lead, isNew: false };
    } else {
      // Create new lead
      lead = await Lead.create(leadData);
      return { lead, isNew: true };
    }
  } catch (err) {
    // Handle unique index violation (shouldn't happen with dedupeKey, but safety check)
    if (err.code === 11000) {
      // Try to find by dedupeKey again
      const dedupeKey = buildDedupeKey(payload, sourceType);
      const lead = await Lead.findOne({ dedupeKey });
      if (lead) {
        return { lead, isNew: false };
      }
    }
    throw err;
  }
}

module.exports = {
  upsertLeadFromSource,
  buildDedupeKey
};

