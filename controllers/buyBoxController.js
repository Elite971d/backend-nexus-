// controllers/buyBoxController.js
const BuyBox = require('../models/BuyBox');
const { normalizeMarket, isValidMarket } = require('../utils/marketUtils');

/**
 * GET /api/buyboxes
 * Get all buy boxes with optional filtering
 * Query params: marketKey, active
 */
exports.getBuyBoxes = async (req, res, next) => {
  try {
    const { marketKey, active } = req.query;
    const query = {};

    if (marketKey) {
      const normalized = normalizeMarket(marketKey);
      if (normalized) {
        query.marketKey = normalized;
      }
    }

    if (active !== undefined) {
      query.active = active === 'true' || active === true;
    }

    const buyBoxes = await BuyBox.find(query).sort({ marketKey: 1, createdAt: -1 });
    res.json(buyBoxes);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/buyboxes/:id
 * Get single buy box
 */
exports.getBuyBox = async (req, res, next) => {
  try {
    const buyBox = await BuyBox.findById(req.params.id);
    if (!buyBox) {
      return res.status(404).json({ error: 'Buy Box not found' });
    }
    res.json(buyBox);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/buyboxes
 * Create new buy box
 */
exports.createBuyBox = async (req, res, next) => {
  try {
    const {
      marketKey,
      label,
      propertyType,
      minBeds,
      minBaths,
      minSqft,
      minYearBuilt,
      conditionAllowed,
      buyPriceMin,
      buyPriceMax,
      arvMin,
      arvMax,
      counties,
      cityOverrides,
      exclusions,
      strategy,
      requiresPositiveCashFlow,
      cashFlowConfig,
      active
    } = req.body;

    // Validate marketKey
    if (!marketKey || !isValidMarket(marketKey)) {
      return res.status(400).json({ error: 'Valid marketKey is required (format: STATE-NAME, e.g., TX-DFW)' });
    }

    // Validate required fields
    if (!label) {
      return res.status(400).json({ error: 'Label is required' });
    }

    if (!propertyType || !Array.isArray(propertyType) || propertyType.length === 0) {
      return res.status(400).json({ error: 'At least one propertyType is required' });
    }

    if (buyPriceMin === undefined || buyPriceMax === undefined) {
      return res.status(400).json({ error: 'buyPriceMin and buyPriceMax are required' });
    }

    if (buyPriceMin >= buyPriceMax) {
      return res.status(400).json({ error: 'buyPriceMin must be less than buyPriceMax' });
    }

    // Auto-set requiresPositiveCashFlow for buy_hold and commercial strategies
    let finalRequiresCashFlow = requiresPositiveCashFlow;
    if (strategy === 'buy_hold' || strategy === 'commercial') {
      finalRequiresCashFlow = true; // Enforce cash flow requirement
    }

    const buyBox = new BuyBox({
      marketKey: normalizeMarket(marketKey),
      label,
      propertyType,
      minBeds,
      minBaths,
      minSqft,
      minYearBuilt,
      conditionAllowed: conditionAllowed || [],
      buyPriceMin,
      buyPriceMax,
      arvMin,
      arvMax,
      counties: counties || [],
      cityOverrides: cityOverrides || {},
      exclusions: exclusions || [],
      strategy: strategy || 'flip',
      requiresPositiveCashFlow: finalRequiresCashFlow !== undefined ? finalRequiresCashFlow : false,
      cashFlowConfig: cashFlowConfig || {},
      active: active !== undefined ? active : true
    });

    await buyBox.save();
    res.status(201).json(buyBox);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * PUT /api/buyboxes/:id
 * Update buy box
 */
exports.updateBuyBox = async (req, res, next) => {
  try {
    const buyBox = await BuyBox.findById(req.params.id);
    if (!buyBox) {
      return res.status(404).json({ error: 'Buy Box not found' });
    }

    const {
      marketKey,
      label,
      propertyType,
      minBeds,
      minBaths,
      minSqft,
      minYearBuilt,
      conditionAllowed,
      buyPriceMin,
      buyPriceMax,
      arvMin,
      arvMax,
      counties,
      cityOverrides,
      exclusions,
      active
    } = req.body;

    // Validate marketKey if provided
    if (marketKey && !isValidMarket(marketKey)) {
      return res.status(400).json({ error: 'Invalid marketKey format' });
    }

    // Validate price range if both provided
    if (buyPriceMin !== undefined && buyPriceMax !== undefined) {
      if (buyPriceMin >= buyPriceMax) {
        return res.status(400).json({ error: 'buyPriceMin must be less than buyPriceMax' });
      }
    }

    // Update fields
    if (marketKey !== undefined) buyBox.marketKey = normalizeMarket(marketKey);
    if (label !== undefined) buyBox.label = label;
    if (propertyType !== undefined) buyBox.propertyType = propertyType;
    if (minBeds !== undefined) buyBox.minBeds = minBeds;
    if (minBaths !== undefined) buyBox.minBaths = minBaths;
    if (minSqft !== undefined) buyBox.minSqft = minSqft;
    if (minYearBuilt !== undefined) buyBox.minYearBuilt = minYearBuilt;
    if (conditionAllowed !== undefined) buyBox.conditionAllowed = conditionAllowed;
    if (buyPriceMin !== undefined) buyBox.buyPriceMin = buyPriceMin;
    if (buyPriceMax !== undefined) buyBox.buyPriceMax = buyPriceMax;
    if (arvMin !== undefined) buyBox.arvMin = arvMin;
    if (arvMax !== undefined) buyBox.arvMax = arvMax;
    if (counties !== undefined) buyBox.counties = counties;
    if (cityOverrides !== undefined) buyBox.cityOverrides = cityOverrides;
    if (exclusions !== undefined) buyBox.exclusions = exclusions;
    if (strategy !== undefined) buyBox.strategy = strategy;
    if (cashFlowConfig !== undefined) buyBox.cashFlowConfig = cashFlowConfig;
    
    // Handle requiresPositiveCashFlow - auto-set for buy_hold/commercial
    if (requiresPositiveCashFlow !== undefined) {
      buyBox.requiresPositiveCashFlow = requiresPositiveCashFlow;
    } else if (strategy !== undefined) {
      // Auto-set if strategy changed to buy_hold or commercial
      if (strategy === 'buy_hold' || strategy === 'commercial') {
        buyBox.requiresPositiveCashFlow = true;
      }
    }
    
    if (active !== undefined) buyBox.active = active;

    await buyBox.save();
    res.json(buyBox);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/buyboxes/:id/toggle
 * Toggle active status of buy box
 */
exports.toggleBuyBox = async (req, res, next) => {
  try {
    const buyBox = await BuyBox.findById(req.params.id);
    if (!buyBox) {
      return res.status(404).json({ error: 'Buy Box not found' });
    }

    buyBox.active = !buyBox.active;
    await buyBox.save();

    res.json({
      message: `Buy Box ${buyBox.active ? 'activated' : 'deactivated'}`,
      buyBox
    });
  } catch (err) {
    next(err);
  }
};

