// services/buyerIntelligenceService.js
const Buyer = require('../models/Buyer');
const Lead = require('../models/Lead');
const { normalizeMarket, getStateFromMarket } = require('../utils/marketUtils');

/**
 * Creates or updates a buyer from transaction data
 * @param {Object} transactionData - Transaction data with buyer info
 * @param {Object} options - Options
 * @returns {Promise<Object>} Buyer document
 */
async function createBuyerFromTransaction(transactionData, options = {}) {
  const {
    buyerName,
    entityName,
    phone,
    email,
    address,
    propertyAddress,
    propertyType,
    purchaseMethod = 'cash',
    purchaseDate,
    amount,
    market,
    source = 'deed_records'
  } = transactionData;

  // Determine market from property address or provided market
  let marketCode = market;
  if (!marketCode && propertyAddress) {
    // Extract state from property address and create market code
    // This is a simple implementation - could be enhanced with geocoding
    const stateMatch = propertyAddress.match(/\b([A-Z]{2})\s+\d{5}\b/i);
    if (stateMatch) {
      const state = stateMatch[1].toUpperCase();
      // Default to state-level market if no specific market identified
      marketCode = `${state}-STATE`;
    }
  }

  // Validate and normalize market
  marketCode = normalizeMarket(marketCode);
  if (!marketCode) {
    console.warn('Could not determine valid market for buyer:', buyerName);
    return null;
  }

  // Normalize property type
  const normalizedPropertyTypes = [];
  if (propertyType) {
    const pt = propertyType.toLowerCase();
    if (pt.includes('single') || pt.includes('sfh') || pt.includes('house')) {
      normalizedPropertyTypes.push('sfh');
    } else if (pt.includes('multi') || pt.includes('mf') || pt.includes('duplex') || pt.includes('triplex') || pt.includes('fourplex')) {
      normalizedPropertyTypes.push('mf');
    } else if (pt.includes('land') || pt.includes('lot') || pt.includes('vacant')) {
      normalizedPropertyTypes.push('land');
    } else if (pt.includes('commercial') || pt.includes('retail') || pt.includes('office')) {
      normalizedPropertyTypes.push('commercial');
    }
  }

  // Build search criteria (name or entity name)
  const searchCriteria = {};
  if (entityName) {
    searchCriteria.entityName = entityName;
  } else if (buyerName) {
    searchCriteria.name = buyerName;
  } else {
    console.warn('Cannot create buyer without name or entityName');
    return null;
  }

  // Try to find existing buyer
  let buyer = await Buyer.findOne(searchCriteria);

  if (buyer) {
    // Update existing buyer
    // Add phone if new
    if (phone && !buyer.phones.includes(phone)) {
      buyer.phones.push(phone);
    }
    // Add email if new
    if (email && !buyer.emails.includes(email)) {
      buyer.emails.push(email);
    }
    // Update mailing address if provided
    if (address && !buyer.mailingAddress) {
      buyer.mailingAddress = address;
    }
    // Add market if new
    if (marketCode && !buyer.markets.includes(marketCode)) {
      buyer.markets.push(marketCode);
    }
    // Add property type if new
    normalizedPropertyTypes.forEach(pt => {
      if (!buyer.propertyTypes.includes(pt)) {
        buyer.propertyTypes.push(pt);
      }
    });
    // Update last purchase date if more recent
    if (purchaseDate && (!buyer.lastPurchaseDate || purchaseDate > buyer.lastPurchaseDate)) {
      buyer.lastPurchaseDate = purchaseDate;
    }
    // Update purchase method if cash
    if (purchaseMethod === 'cash') {
      buyer.purchaseMethod = 'cash';
    }
    // Update source if from skip trace or deed records
    if (source === 'skip_trace' || source === 'deed_records') {
      buyer.source = source;
    }
  } else {
    // Create new buyer
    buyer = new Buyer({
      name: buyerName || null,
      entityName: entityName || null,
      phones: phone ? [phone] : [],
      emails: email ? [email] : [],
      mailingAddress: address || null,
      markets: marketCode ? [marketCode] : [],
      propertyTypes: normalizedPropertyTypes.length > 0 ? normalizedPropertyTypes : [],
      lastPurchaseDate: purchaseDate || null,
      purchaseMethod: purchaseMethod || 'cash',
      source: source || 'deed_records',
      confidenceScore: source === 'skip_trace' ? 85 : 70
    });
  }

  await buyer.save();
  return buyer;
}

/**
 * Creates buyer from skip trace entity info
 * @param {Object} lead - Lead with skip trace data
 * @param {Object} entityInfo - Entity info from skip trace
 * @returns {Promise<Object|null>} Buyer document or null
 */
async function createBuyerFromSkipTrace(lead, entityInfo) {
  if (!entityInfo || !entityInfo.isLLC || !entityInfo.entityName) {
    return null;
  }

  // Determine market from lead
  let marketCode = null;
  if (lead.state && lead.county) {
    // Create market code like TX-DFW based on state and county
    const state = lead.state.toUpperCase();
    // This is simplified - in production, you'd have a mapping of counties to markets
    if (state === 'TX') {
      const county = lead.county.toUpperCase();
      if (county.includes('DALLAS') || county.includes('TARRANT') || county.includes('COLLIN') || county.includes('DENTON')) {
        marketCode = 'TX-DFW';
      } else if (county.includes('HARRIS') || county.includes('FORT BEND') || county.includes('MONTGOMERY')) {
        marketCode = 'TX-HOUSTON';
      }
    }
  }

  if (!marketCode && lead.state) {
    // Fallback to state-level market
    marketCode = `${lead.state.toUpperCase()}-STATE`;
  }

  marketCode = normalizeMarket(marketCode);
  if (!marketCode) {
    return null;
  }

  // Extract phones and emails from skip trace
  const phones = lead.skipTrace?.phones?.map(p => p.number) || [];
  const emails = lead.skipTrace?.emails?.map(e => e.email) || [];
  const mailingAddress = lead.skipTrace?.mailingAddresses?.[0]?.address || lead.mailingAddress || null;

  // Check if buyer already exists
  let buyer = await Buyer.findOne({ entityName: entityInfo.entityName });

  if (buyer) {
    // Update existing
    phones.forEach(phone => {
      if (!buyer.phones.includes(phone)) buyer.phones.push(phone);
    });
    emails.forEach(email => {
      if (!buyer.emails.includes(email)) buyer.emails.push(email);
    });
    if (mailingAddress && !buyer.mailingAddress) {
      buyer.mailingAddress = mailingAddress;
    }
    if (!buyer.markets.includes(marketCode)) {
      buyer.markets.push(marketCode);
    }
    buyer.source = 'skip_trace';
    buyer.confidenceScore = lead.skipTrace?.confidenceScore || buyer.confidenceScore;
  } else {
    // Create new
    buyer = new Buyer({
      name: lead.ownerName || null,
      entityName: entityInfo.entityName,
      phones,
      emails,
      mailingAddress,
      markets: [marketCode],
      propertyTypes: [], // Will be updated when property type is known
      purchaseMethod: 'cash', // Assuming cash buyers from skip trace
      source: 'skip_trace',
      confidenceScore: lead.skipTrace?.confidenceScore || 85
    });
  }

  await buyer.save();
  return buyer;
}

/**
 * Auto-creates buyers from lead transactions marked as cash
 * This is called when a lead's closer.offerLaneFinal is set to 'cash'
 * or when transaction data indicates cash purchase
 */
async function processCashBuyerFromLead(lead) {
  // If lead indicates cash buyer entity from skip trace
  if (lead.skipTrace?.entityInfo?.isLLC && lead.skipTrace?.entityInfo?.entityName) {
    return await createBuyerFromSkipTrace(lead, lead.skipTrace.entityInfo);
  }

  // If lead has cash offer, create buyer from lead data
  if (lead.closer?.offerLaneFinal === 'cash' && lead.ownerName) {
    const marketCode = normalizeMarket(
      lead.state ? `${lead.state.toUpperCase()}-${lead.county?.toUpperCase() || 'STATE'}` : null
    );

    if (!marketCode) return null;

    // Determine property type from lead data
    const propertyTypes = [];
    if (lead.dialerIntake?.propertyType) {
      const pt = lead.dialerIntake.propertyType.toLowerCase();
      if (pt.includes('single') || pt.includes('sfh')) propertyTypes.push('sfh');
      else if (pt.includes('multi') || pt.includes('mf')) propertyTypes.push('mf');
      else if (pt.includes('land')) propertyTypes.push('land');
      else if (pt.includes('commercial')) propertyTypes.push('commercial');
    }

    // Extract contact info from skip trace if available
    const phones = lead.skipTrace?.phones?.map(p => p.number) || [];
    const emails = lead.skipTrace?.emails?.map(e => e.email) || [];
    const mailingAddress = lead.skipTrace?.mailingAddresses?.[0]?.address || lead.mailingAddress || null;

    let buyer = await Buyer.findOne({ name: lead.ownerName });

    if (buyer) {
      // Update existing
      phones.forEach(phone => {
        if (!buyer.phones.includes(phone)) buyer.phones.push(phone);
      });
      emails.forEach(email => {
        if (!buyer.emails.includes(email)) buyer.emails.push(email);
      });
      if (mailingAddress && !buyer.mailingAddress) {
        buyer.mailingAddress = mailingAddress;
      }
      if (!buyer.markets.includes(marketCode)) {
        buyer.markets.push(marketCode);
      }
      propertyTypes.forEach(pt => {
        if (!buyer.propertyTypes.includes(pt)) {
          buyer.propertyTypes.push(pt);
        }
      });
      buyer.purchaseMethod = 'cash';
    } else {
      // Create new
      buyer = new Buyer({
        name: lead.ownerName,
        entityName: lead.skipTrace?.entityInfo?.entityName || null,
        phones,
        emails,
        mailingAddress,
        markets: [marketCode],
        propertyTypes,
        purchaseMethod: 'cash',
        source: lead.skipTrace?.status === 'completed' ? 'skip_trace' : 'manual',
        confidenceScore: lead.skipTrace?.confidenceScore || 70
      });
    }

    await buyer.save();
    return buyer;
  }

  return null;
}

module.exports = {
  createBuyerFromTransaction,
  createBuyerFromSkipTrace,
  processCashBuyerFromLead
};

