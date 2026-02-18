// controllers/dealPerformanceController.js
const DealPerformance = require('../models/DealPerformance');
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const BuyBox = require('../models/BuyBox');
const { calculatePerformanceGrade, generatePerformanceFlags, calculateBuyBoxPerformanceMetrics } = require('../utils/performanceGrading');
const { calculateCashFlow } = require('../utils/cashFlowCalculator');
const { processPerformanceFeedback, getBuyBoxWarnings, recalculateAllFeedbackLoops } = require('../services/performanceFeedbackService');

/**
 * POST /api/deals/:id/performance
 * Create initial performance record with pro forma snapshot (locked at close)
 * Roles: admin, manager, closer
 */
exports.createPerformanceRecord = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const userId = req.user.id;
    
    // Get lead
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Check if performance record already exists
    const existing = await DealPerformance.findOne({ leadId });
    if (existing) {
      return res.status(400).json({ error: 'Performance record already exists for this deal' });
    }
    
    const {
      buyerId,
      strategy,
      marketKey,
      closedDate,
      purchasePrice,
      rehabCostActual = 0,
      financing,
      projectedRent,
      projectedNOI,
      projectedMonthlyCashFlow,
      projectedDSCR,
      assumptionsUsed = [],
      buyBoxId
    } = req.body;
    
    // Validate required fields
    if (!buyerId || !strategy || !marketKey || !closedDate || !purchasePrice) {
      return res.status(400).json({ error: 'Missing required fields: buyerId, strategy, marketKey, closedDate, purchasePrice' });
    }
    
    if (!['buy_hold', 'commercial'].includes(strategy)) {
      return res.status(400).json({ error: 'Strategy must be buy_hold or commercial' });
    }
    
    if (!financing || !financing.loanType || financing.interestRate === undefined || financing.ltv === undefined || !financing.amortization) {
      return res.status(400).json({ error: 'Financing details required: loanType, interestRate, ltv, amortization' });
    }
    
    if (!projectedRent || !projectedNOI || projectedMonthlyCashFlow === undefined || !projectedDSCR) {
      return res.status(400).json({ error: 'Pro forma projections required: projectedRent, projectedNOI, projectedMonthlyCashFlow, projectedDSCR' });
    }
    
    // Verify buyer exists
    const buyer = await Buyer.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }
    
    // Verify buy box exists if provided
    if (buyBoxId) {
      const buyBox = await BuyBox.findById(buyBoxId);
      if (!buyBox) {
        return res.status(404).json({ error: 'Buy Box not found' });
      }
    }
    
    // Create performance record with locked pro forma
    const performance = new DealPerformance({
      leadId,
      buyerId,
      strategy,
      marketKey,
      closedDate: new Date(closedDate),
      purchasePrice,
      rehabCostActual,
      financing,
      proForma: {
        projectedRent,
        projectedNOI,
        projectedMonthlyCashFlow,
        projectedDSCR,
        assumptionsUsed,
        lockedAt: new Date(),
        lockedBy: userId
      },
      buyBoxId: buyBoxId || lead.leadScore?.buyBoxId || null,
      actualPerformance: [],
      currentStatus: {
        performanceGrade: null,
        flags: [],
        notes: '',
        lastUpdated: null
      }
    });
    
    await performance.save();
    
    // Process feedback loops (async, don't wait)
    processPerformanceFeedback(performance._id).catch(err => {
      console.error('Error processing performance feedback:', err);
    });
    
    res.status(201).json(performance);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * PUT /api/deals/:id/performance/:periodId
 * Update a specific performance period
 * Roles: admin, manager
 */
exports.updatePerformancePeriod = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const periodId = req.params.periodId;
    const userId = req.user.id;
    
    const performance = await DealPerformance.findOne({ leadId });
    if (!performance) {
      return res.status(404).json({ error: 'Performance record not found' });
    }
    
    // Find the period to update
    const periodIndex = performance.actualPerformance.findIndex(
      p => p._id.toString() === periodId
    );
    
    if (periodIndex === -1) {
      return res.status(404).json({ error: 'Performance period not found' });
    }
    
    const {
      actualRentCollected,
      actualVacancyRate = 0,
      actualExpenses = {},
      actualNOI,
      actualMonthlyCashFlow,
      actualDSCR,
      notes = '',
      flags = []
    } = req.body;
    
    // Validate required fields
    if (actualRentCollected === undefined || actualNOI === undefined || 
        actualMonthlyCashFlow === undefined || actualDSCR === undefined) {
      return res.status(400).json({ error: 'Missing required fields: actualRentCollected, actualNOI, actualMonthlyCashFlow, actualDSCR' });
    }
    
    // Calculate total expenses if breakdown provided
    const totalExpenses = actualExpenses.total !== undefined 
      ? actualExpenses.total
      : (actualExpenses.maintenance || 0) + 
        (actualExpenses.propertyManagement || 0) + 
        (actualExpenses.taxes || 0) + 
        (actualExpenses.insurance || 0) + 
        (actualExpenses.other || 0);
    
    // Update the period
    performance.actualPerformance[periodIndex].actualRentCollected = actualRentCollected;
    performance.actualPerformance[periodIndex].actualVacancyRate = actualVacancyRate;
    performance.actualPerformance[periodIndex].actualExpenses = {
      ...actualExpenses,
      total: totalExpenses
    };
    performance.actualPerformance[periodIndex].actualNOI = actualNOI;
    performance.actualPerformance[periodIndex].actualMonthlyCashFlow = actualMonthlyCashFlow;
    performance.actualPerformance[periodIndex].actualDSCR = actualDSCR;
    performance.actualPerformance[periodIndex].notes = notes;
    performance.actualPerformance[periodIndex].updatedBy = userId;
    performance.actualPerformance[periodIndex].updatedAt = new Date();
    
    // Auto-generate flags if not provided
    if (flags.length === 0) {
      performance.actualPerformance[periodIndex].flags = generatePerformanceFlags(
        performance.actualPerformance[periodIndex],
        performance.proForma
      );
    } else {
      performance.actualPerformance[periodIndex].flags = flags;
    }
    
    // Save (pre-save hook will calculate variances and grade)
    await performance.save();
    
    // Process feedback loops (async, don't wait)
    processPerformanceFeedback(performance._id).catch(err => {
      console.error('Error processing performance feedback:', err);
    });
    
    res.json(performance.actualPerformance[periodIndex]);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/deals/:id/performance/periods
 * Add a new performance period
 * Roles: admin, manager
 */
exports.addPerformancePeriod = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const userId = req.user.id;
    
    const performance = await DealPerformance.findOne({ leadId });
    if (!performance) {
      return res.status(404).json({ error: 'Performance record not found' });
    }
    
    const {
      reportingPeriod,
      actualRentCollected,
      actualVacancyRate = 0,
      actualExpenses = {},
      actualNOI,
      actualMonthlyCashFlow,
      actualDSCR,
      notes = '',
      flags = []
    } = req.body;
    
    // Validate required fields
    if (!reportingPeriod || !reportingPeriod.month || !reportingPeriod.year) {
      return res.status(400).json({ error: 'Missing required field: reportingPeriod with month and year' });
    }
    
    if (actualRentCollected === undefined || actualNOI === undefined || 
        actualMonthlyCashFlow === undefined || actualDSCR === undefined) {
      return res.status(400).json({ error: 'Missing required fields: actualRentCollected, actualNOI, actualMonthlyCashFlow, actualDSCR' });
    }
    
    // Check for duplicate period
    const duplicate = performance.actualPerformance.find(
      p => p.reportingPeriod.month === reportingPeriod.month && 
           p.reportingPeriod.year === reportingPeriod.year
    );
    if (duplicate) {
      return res.status(400).json({ error: 'Performance period already exists for this month/year' });
    }
    
    // Calculate total expenses
    const totalExpenses = actualExpenses.total !== undefined 
      ? actualExpenses.total
      : (actualExpenses.maintenance || 0) + 
        (actualExpenses.propertyManagement || 0) + 
        (actualExpenses.taxes || 0) + 
        (actualExpenses.insurance || 0) + 
        (actualExpenses.other || 0);
    
    // Create new period
    const newPeriod = {
      reportingPeriod: {
        month: reportingPeriod.month,
        year: reportingPeriod.year
      },
      actualRentCollected,
      actualVacancyRate,
      actualExpenses: {
        ...actualExpenses,
        total: totalExpenses
      },
      actualNOI,
      actualMonthlyCashFlow,
      actualDSCR,
      notes,
      enteredBy: userId,
      enteredAt: new Date(),
      updatedAt: new Date()
    };
    
    // Auto-generate flags if not provided
    if (flags.length === 0) {
      newPeriod.flags = generatePerformanceFlags(newPeriod, performance.proForma);
    } else {
      newPeriod.flags = flags;
    }
    
    performance.actualPerformance.push(newPeriod);
    
    // Save (pre-save hook will calculate variances and grade)
    await performance.save();
    
    // Process feedback loops (async, don't wait)
    processPerformanceFeedback(performance._id).catch(err => {
      console.error('Error processing performance feedback:', err);
    });
    
    // Get the newly added period (with calculated fields)
    const addedPeriod = performance.actualPerformance[performance.actualPerformance.length - 1];
    
    res.status(201).json(addedPeriod);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * GET /api/deals/:id/performance
 * Get performance record for a deal
 * Roles: admin, manager, closer (read-only for dialers)
 */
exports.getPerformance = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    
    const performance = await DealPerformance.findOne({ leadId })
      .populate('buyerId', 'name entityName')
      .populate('buyBoxId', 'label marketKey')
      .populate('proForma.lockedBy', 'name email')
      .populate('actualPerformance.enteredBy', 'name email')
      .populate('actualPerformance.updatedBy', 'name email');
    
    if (!performance) {
      return res.status(404).json({ error: 'Performance record not found' });
    }
    
    res.json(performance);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/performance/buybox/:buyBoxId
 * Get performance metrics for a specific buy box
 * Roles: admin, manager
 */
exports.getBuyBoxPerformance = async (req, res, next) => {
  try {
    const buyBoxId = req.params.buyBoxId;
    
    const performances = await DealPerformance.find({ buyBoxId })
      .populate('buyerId', 'name entityName')
      .populate('leadId', 'propertyAddress city county');
    
    const metrics = calculateBuyBoxPerformanceMetrics(performances);
    
    res.json({
      buyBoxId,
      metrics,
      performances: performances.map(p => ({
        _id: p._id,
        leadId: p.leadId,
        buyerId: p.buyerId,
        closedDate: p.closedDate,
        currentStatus: p.currentStatus,
        latestPerformance: p.getLatestPerformance()
      }))
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/performance/analytics
 * Get performance analytics with filtering
 * Query params: marketKey, strategy, buyerId, buyBoxId, startDate, endDate
 * Roles: admin, manager
 */
exports.getPerformanceAnalytics = async (req, res, next) => {
  try {
    const { marketKey, strategy, buyerId, buyBoxId, startDate, endDate } = req.query;
    
    const query = {};
    
    if (marketKey) query.marketKey = marketKey;
    if (strategy) query.strategy = strategy;
    if (buyerId) query.buyerId = buyerId;
    if (buyBoxId) query.buyBoxId = buyBoxId;
    if (startDate || endDate) {
      query.closedDate = {};
      if (startDate) query.closedDate.$gte = new Date(startDate);
      if (endDate) query.closedDate.$lte = new Date(endDate);
    }
    
    const performances = await DealPerformance.find(query)
      .populate('buyerId', 'name entityName')
      .populate('buyBoxId', 'label marketKey')
      .populate('leadId', 'propertyAddress city county');
    
    // Aggregate metrics
    const metrics = calculateBuyBoxPerformanceMetrics(performances);
    
    // Group by market
    const byMarket = {};
    performances.forEach(p => {
      if (!byMarket[p.marketKey]) {
        byMarket[p.marketKey] = [];
      }
      byMarket[p.marketKey].push(p);
    });
    
    const marketMetrics = {};
    Object.keys(byMarket).forEach(market => {
      marketMetrics[market] = calculateBuyBoxPerformanceMetrics(byMarket[market]);
    });
    
    // Group by strategy
    const byStrategy = {};
    performances.forEach(p => {
      if (!byStrategy[p.strategy]) {
        byStrategy[p.strategy] = [];
      }
      byStrategy[p.strategy].push(p);
    });
    
    const strategyMetrics = {};
    Object.keys(byStrategy).forEach(strat => {
      strategyMetrics[strat] = calculateBuyBoxPerformanceMetrics(byStrategy[strat]);
    });
    
    // Group by buyer
    const byBuyer = {};
    performances.forEach(p => {
      const buyerKey = p.buyerId._id.toString();
      if (!byBuyer[buyerKey]) {
        byBuyer[buyerKey] = [];
      }
      byBuyer[buyerKey].push(p);
    });
    
    const buyerMetrics = {};
    Object.keys(byBuyer).forEach(buyerKey => {
      buyerMetrics[buyerKey] = calculateBuyBoxPerformanceMetrics(byBuyer[buyerKey]);
    });
    
    res.json({
      summary: metrics,
      byMarket: marketMetrics,
      byStrategy: strategyMetrics,
      byBuyer: buyerMetrics,
      totalRecords: performances.length
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/performance/warnings
 * Get buy box performance warnings
 * Roles: admin, manager
 */
exports.getPerformanceWarnings = async (req, res, next) => {
  try {
    const { marketKey } = req.query;
    const warnings = await getBuyBoxWarnings(marketKey);
    res.json({ warnings });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/performance/recalculate-feedback
 * Recalculate all feedback loops (batch processing)
 * Roles: admin only
 */
exports.recalculateFeedback = async (req, res, next) => {
  try {
    const results = await recalculateAllFeedbackLoops();
    res.json({
      message: 'Feedback loops recalculated',
      results
    });
  } catch (err) {
    next(err);
  }
};

