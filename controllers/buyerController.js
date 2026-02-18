// controllers/buyerController.js
const Buyer = require('../models/Buyer');
const { validateMarkets, normalizeMarket } = require('../utils/marketUtils');
const { processCashBuyerFromLead } = require('../services/buyerIntelligenceService');
const Lead = require('../models/Lead');
const BuyBox = require('../models/BuyBox');

/**
 * GET /api/buyers
 * Get buyers list with optional filtering
 * Query params: market, type (propertyType), purchaseMethod
 */
exports.getBuyers = async (req, res, next) => {
  try {
    const { market, type, purchaseMethod } = req.query;

    // Build query
    const query = {};

    // Filter by active status (default: only active buyers)
    if (req.query.active !== undefined) {
      query.active = req.query.active === 'true' || req.query.active === true;
    } else {
      query.active = true; // Default to active only
    }

    // Filter by market
    if (market) {
      const normalizedMarket = validateMarkets([market])[0];
      if (normalizedMarket) {
        query.markets = normalizedMarket;
      }
    }

    // Filter by property type
    if (type) {
      const validTypes = ['sfh', 'mf', 'land', 'commercial'];
      if (validTypes.includes(type.toLowerCase())) {
        query.propertyTypes = type.toLowerCase();
      }
    }

    // Filter by purchase method
    if (purchaseMethod) {
      const validMethods = ['cash', 'hard_money', 'other'];
      if (validMethods.includes(purchaseMethod.toLowerCase())) {
        query.purchaseMethod = purchaseMethod.toLowerCase();
      }
    }

    // Enhanced filtering for buyer management
    const { maxBuyPrice, minArv, strategy, hasOptOut, engagementScoreMin } = req.query;
    
    if (maxBuyPrice) {
      query.maxBuyPrice = { $lte: parseFloat(maxBuyPrice) };
    }
    
    if (minArv) {
      query.minArv = { $gte: parseFloat(minArv) };
    }
    
    if (strategy) {
      query.strategies = strategy;
    }
    
    if (hasOptOut === 'true') {
      query.$or = [
        { 'optOut.sms': true },
        { 'optOut.email': true }
      ];
    } else if (hasOptOut === 'false') {
      query.$and = [
        { $or: [{ 'optOut.sms': { $ne: true } }, { 'optOut.sms': { $exists: false } }] },
        { $or: [{ 'optOut.email': { $ne: true } }, { 'optOut.email': { $exists: false } }] }
      ];
    }
    
    if (engagementScoreMin) {
      query.engagementScore = { $gte: parseFloat(engagementScoreMin) };
    }
    
    // Also check preferredMarkets if provided
    if (market) {
      const normalizedMarket = validateMarkets([market])[0];
      if (normalizedMarket) {
        query.$or = [
          { markets: normalizedMarket },
          { preferredMarkets: normalizedMarket }
        ];
      }
    }

    const buyers = await Buyer.find(query)
      .sort({ engagementScore: -1, lastPurchaseDate: -1, confidenceScore: -1 })
      .limit(500); // Reasonable limit

    res.json(buyers);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/buyers/:id
 * Get single buyer
 */
exports.getBuyer = async (req, res, next) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }
    res.json(buyer);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/buyers
 * Create buyer manually
 */
exports.createBuyer = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      entityName,
      phones,
      emails,
      mailingAddress,
      markets,
      preferredMarkets,
      counties,
      states,
      buyerType,
      propertyTypes,
      purchaseMethod,
      minPrice,
      maxPrice,
      minBeds,
      minBaths,
      minSqft,
      yearBuiltMin,
      conditionTolerance,
      dealTypes,
      cashReady,
      proofOfFunds,
      avgCloseDays,
      notes,
      active,
      source,
      tags
    } = req.body;

    // Validate markets
    const normalizedMarkets = validateMarkets(markets || []);
    const normalizedPreferredMarkets = validateMarkets(preferredMarkets || []);

    // Ensure emails/phones arrays include primary email/phone
    const emailsArray = Array.isArray(emails) ? [...emails] : [];
    if (email && !emailsArray.includes(email)) {
      emailsArray.unshift(email);
    }
    
    const phonesArray = Array.isArray(phones) ? [...phones] : [];
    if (phone && !phonesArray.includes(phone)) {
      phonesArray.unshift(phone);
    }

    const buyer = new Buyer({
      name: name || null,
      email: email || (emailsArray.length > 0 ? emailsArray[0] : null),
      phone: phone || (phonesArray.length > 0 ? phonesArray[0] : null),
      entityName: entityName || null,
      phones: phonesArray,
      emails: emailsArray,
      mailingAddress: mailingAddress || null,
      markets: normalizedMarkets,
      preferredMarkets: normalizedPreferredMarkets,
      counties: Array.isArray(counties) ? counties : [],
      states: Array.isArray(states) ? states : [],
      buyerType: buyerType || null,
      propertyTypes: Array.isArray(propertyTypes) ? propertyTypes : [],
      purchaseMethod: purchaseMethod || 'cash',
      minPrice: minPrice || null,
      maxPrice: maxPrice || null,
      minBeds: minBeds || null,
      minBaths: minBaths || null,
      minSqft: minSqft || null,
      yearBuiltMin: yearBuiltMin || null,
      minYearBuilt: yearBuiltMin || null, // Alias
      conditionTolerance: conditionTolerance || null,
      dealTypes: Array.isArray(dealTypes) ? dealTypes : [],
      cashReady: cashReady || false,
      proofOfFunds: proofOfFunds || false,
      avgCloseDays: avgCloseDays || null,
      notes: notes || null,
      active: active !== undefined ? active : true,
      source: source || 'manual',
      tags: Array.isArray(tags) ? tags : [],
      confidenceScore: 70
    });

    await buyer.save();
    res.status(201).json(buyer);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/buyers/:id
 * Update buyer
 */
exports.updateBuyer = async (req, res, next) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }

    const {
      name,
      email,
      phone,
      entityName,
      phones,
      emails,
      mailingAddress,
      markets,
      preferredMarkets,
      counties,
      states,
      buyerType,
      propertyTypes,
      purchaseMethod,
      minPrice,
      maxPrice,
      minBeds,
      minBaths,
      minSqft,
      yearBuiltMin,
      conditionTolerance,
      dealTypes,
      cashReady,
      proofOfFunds,
      avgCloseDays,
      notes,
      active,
      source,
      tags
    } = req.body;

    if (name !== undefined) buyer.name = name;
    if (email !== undefined) buyer.email = email;
    if (phone !== undefined) buyer.phone = phone;
    if (entityName !== undefined) buyer.entityName = entityName;
    if (phones !== undefined) buyer.phones = Array.isArray(phones) ? phones : buyer.phones;
    if (emails !== undefined) buyer.emails = Array.isArray(emails) ? emails : buyer.emails;
    if (mailingAddress !== undefined) buyer.mailingAddress = mailingAddress;
    if (markets !== undefined) buyer.markets = validateMarkets(markets);
    if (preferredMarkets !== undefined) buyer.preferredMarkets = validateMarkets(preferredMarkets);
    if (counties !== undefined) buyer.counties = Array.isArray(counties) ? counties : buyer.counties;
    if (states !== undefined) buyer.states = Array.isArray(states) ? states : buyer.states;
    if (buyerType !== undefined) buyer.buyerType = buyerType;
    if (propertyTypes !== undefined) buyer.propertyTypes = Array.isArray(propertyTypes) ? propertyTypes : buyer.propertyTypes;
    if (purchaseMethod !== undefined) buyer.purchaseMethod = purchaseMethod;
    if (minPrice !== undefined) buyer.minPrice = minPrice;
    if (maxPrice !== undefined) buyer.maxPrice = maxPrice;
    if (minBeds !== undefined) buyer.minBeds = minBeds;
    if (minBaths !== undefined) buyer.minBaths = minBaths;
    if (minSqft !== undefined) buyer.minSqft = minSqft;
    if (yearBuiltMin !== undefined) {
      buyer.yearBuiltMin = yearBuiltMin;
      buyer.minYearBuilt = yearBuiltMin; // Alias
    }
    if (conditionTolerance !== undefined) buyer.conditionTolerance = conditionTolerance;
    if (dealTypes !== undefined) buyer.dealTypes = Array.isArray(dealTypes) ? dealTypes : buyer.dealTypes;
    if (cashReady !== undefined) buyer.cashReady = cashReady;
    if (proofOfFunds !== undefined) buyer.proofOfFunds = proofOfFunds;
    if (avgCloseDays !== undefined) buyer.avgCloseDays = avgCloseDays;
    if (notes !== undefined) buyer.notes = notes;
    if (active !== undefined) buyer.active = active;
    if (source !== undefined) buyer.source = source;
    if (tags !== undefined) buyer.tags = Array.isArray(tags) ? tags : buyer.tags;

    await buyer.save();
    res.json(buyer);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/buyers/:id
 * Soft delete buyer (set active=false)
 */
exports.deleteBuyer = async (req, res, next) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }

    // Soft delete
    buyer.active = false;
    await buyer.save();

    res.json({
      message: 'Buyer deactivated successfully',
      buyer
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/buyers/leads/:leadId/attach
 * Attach buyer to lead and process as cash buyer
 */
exports.attachBuyerToLead = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { buyerId } = req.body;

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const buyer = await Buyer.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }

    // Process lead as cash buyer if offer lane is cash
    if (lead.closer?.offerLaneFinal === 'cash') {
      await processCashBuyerFromLead(lead);
    }

    // Store buyer reference in lead metadata (or extend Lead model with buyerId field)
    if (!lead.metadata) lead.metadata = {};
    lead.metadata.attachedBuyerId = buyerId;
    await lead.save();

    res.json({
      message: 'Buyer attached to lead',
      lead,
      buyer
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/buyers/export
 * Export buyers as CSV (simple implementation)
 */
exports.exportBuyers = async (req, res, next) => {
  try {
    const { market, type, purchaseMethod } = req.query;

    // Build query (same as getBuyers)
    const query = {};
    if (market) {
      const normalizedMarket = validateMarkets([market])[0];
      if (normalizedMarket) query.markets = normalizedMarket;
    }
    if (type) {
      const validTypes = ['sfh', 'mf', 'land', 'commercial'];
      if (validTypes.includes(type.toLowerCase())) {
        query.propertyTypes = type.toLowerCase();
      }
    }
    if (purchaseMethod) {
      const validMethods = ['cash', 'hard_money', 'other'];
      if (validMethods.includes(purchaseMethod.toLowerCase())) {
        query.purchaseMethod = purchaseMethod.toLowerCase();
      }
    }

    const buyers = await Buyer.find(query).sort({ lastPurchaseDate: -1 });

    // Simple CSV generation
    const headers = ['Name', 'Entity Name', 'Phones', 'Emails', 'Mailing Address', 'Markets', 'Property Types', 'Last Purchase Date', 'Purchase Method'];
    const rows = buyers.map(buyer => [
      buyer.name || '',
      buyer.entityName || '',
      buyer.phones.join('; '),
      buyer.emails.join('; '),
      buyer.mailingAddress || '',
      buyer.markets.join('; '),
      buyer.propertyTypes.join('; '),
      buyer.lastPurchaseDate ? buyer.lastPurchaseDate.toISOString().split('T')[0] : '',
      buyer.purchaseMethod || ''
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=buyers.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/buyers/match/:leadId
 * Match buyers for a lead based on leadScore and Buy Box criteria
 */
exports.matchBuyersForLead = async (req, res, next) => {
  try {
    const { leadId } = req.params;
    
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get lead's buy box info
    const buyBoxKey = lead.leadScore?.buyBoxKey;
    const buyBoxId = lead.leadScore?.buyBoxId;
    
    if (!buyBoxKey) {
      return res.status(400).json({ 
        error: 'Lead has no matched Buy Box. Score the lead first.' 
      });
    }

    // Get the buy box to understand criteria
    let buyBox = null;
    if (buyBoxId) {
      buyBox = await BuyBox.findById(buyBoxId);
    }
    if (!buyBox) {
      buyBox = await BuyBox.findOne({ marketKey: buyBoxKey, active: true });
    }

    // Determine property type from lead
    const propertyType = lead.dialerIntake?.propertyType || lead.propertyType;
    let normalizedPropertyType = null;
    if (propertyType) {
      const pt = propertyType.toUpperCase();
      if (pt.includes('SFR') || pt.includes('SINGLE') || pt.includes('SFH')) {
        normalizedPropertyType = 'sfh';
      } else if (pt.includes('MULTI') || pt.includes('MF')) {
        normalizedPropertyType = 'mf';
      } else if (pt.includes('LAND')) {
        normalizedPropertyType = 'land';
      } else if (pt.includes('COMMERCIAL')) {
        normalizedPropertyType = 'commercial';
      }
    }

    // Build buyer query based on buy box criteria
    const buyerQuery = {
      markets: buyBoxKey
    };

    // Filter by property type if available
    if (normalizedPropertyType) {
      buyerQuery.propertyTypes = normalizedPropertyType;
    }

    // Find matching buyers
    const buyers = await Buyer.find(buyerQuery)
      .sort({ 
        lastPurchaseDate: -1,  // Recent buyers first
        confidenceScore: -1     // Then by confidence
      })
      .limit(50);

    // Score and rank buyers based on:
    // 1. Market match (already filtered)
    // 2. Property type match
    // 3. Historical closings (lastPurchaseDate)
    // 4. Confidence score
    // 5. Lead score (higher lead score = better match)
    const scoredBuyers = buyers.map(buyer => {
      let matchScore = 50; // Base score

      // Property type match bonus
      if (normalizedPropertyType && buyer.propertyTypes.includes(normalizedPropertyType)) {
        matchScore += 20;
      }

      // Recent purchase bonus (within last 6 months = +15, last year = +10)
      if (buyer.lastPurchaseDate) {
        const monthsSincePurchase = (Date.now() - buyer.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsSincePurchase <= 6) {
          matchScore += 15;
        } else if (monthsSincePurchase <= 12) {
          matchScore += 10;
        } else if (monthsSincePurchase <= 24) {
          matchScore += 5;
        }
      }

      // Confidence score bonus (0-100 scaled to 0-10)
      if (buyer.confidenceScore) {
        matchScore += (buyer.confidenceScore / 10);
      }

      // Lead score influence (higher lead score = better match confidence)
      const leadScore = lead.leadScore?.score || 0;
      matchScore += (leadScore / 5); // Scale 0-100 to 0-20

      // Clamp to 0-100
      matchScore = Math.min(100, Math.max(0, matchScore));

      return {
        buyer,
        matchScore: Math.round(matchScore),
        matchReasons: [
          `Market match: ${buyBoxKey}`,
          normalizedPropertyType && buyer.propertyTypes.includes(normalizedPropertyType) 
            ? `Property type match: ${normalizedPropertyType}` 
            : null,
          buyer.lastPurchaseDate 
            ? `Last purchase: ${buyer.lastPurchaseDate.toISOString().split('T')[0]}` 
            : null,
          buyer.confidenceScore 
            ? `Confidence: ${buyer.confidenceScore}%` 
            : null
        ].filter(Boolean)
      };
    });

    // Sort by match score descending
    scoredBuyers.sort((a, b) => b.matchScore - a.matchScore);

    res.json({
      lead: {
        id: lead._id,
        propertyAddress: lead.propertyAddress || lead.dialerIntake?.propertyAddress,
        leadScore: lead.leadScore,
        buyBox: buyBox ? {
          id: buyBox._id,
          label: buyBox.label,
          marketKey: buyBox.marketKey
        } : null
      },
      matchedBuyers: scoredBuyers,
      totalMatches: scoredBuyers.length
    });
  } catch (err) {
    next(err);
  }
};

