// models/Buyer.js
const mongoose = require('mongoose');

const buyerSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    name: { type: String, required: true, index: true },
    email: { type: String }, // Primary email (for backward compat, also use emails array)
    phone: { type: String, index: true }, // Primary phone (normalized E.164 format)
    entityName: { type: String },
    phones: [{ type: String }],
    emails: [{ type: String }],
    mailingAddress: { type: String },
    markets: [{ type: String, index: true }], // e.g., ['TX-DFW', 'TX-HOUSTON', 'CA-LA']
    // Extended buyer preferences for matching
    preferredMarkets: [{ type: String, index: true }], // e.g., ['TX-DFW', 'TX-HOUSTON']
    preferredCounties: [{ type: String }],
    preferredCities: [{ type: String }],
    // New fields per requirements
    buyerType: {
      type: String,
      enum: ['fix_and_flip', 'buy_and_hold', 'commercial'],
      index: true
    },
    counties: [{ type: String, index: true }], // Target counties (e.g., ['Dallas', 'Collin', 'Tarrant', 'Denton'])
    states: [{ type: String, index: true }], // Target states (e.g., ['TX', 'CA'])
    propertyTypes: [{
      type: String,
      enum: ['sfh', 'mf', 'land', 'commercial', 'SFR', 'MF', 'LAND', 'COMMERCIAL', 'Multi'],
      index: true
    }],
    minBeds: { type: Number },
    minBaths: { type: Number },
    minSqft: { type: Number },
    yearBuiltMin: { type: Number }, // Alias for minYearBuilt
    minYearBuilt: { type: Number }, // Keep for backward compat
    minPrice: { type: Number, index: true },
    maxPrice: { type: Number, index: true },
    conditionTolerance: {
      type: String,
      enum: ['light', 'medium', 'heavy'],
      index: true
    },
    maxRehabLevel: {
      type: String,
      enum: ['light', 'medium', 'heavy', null],
      default: null
    },
    maxBuyPrice: { type: Number }, // Keep for backward compat
    minArv: { type: Number },
    dealTypes: [{
      type: String,
      enum: ['cash', 'novation', 'subto', 'seller_finance'],
      index: true
    }],
    strategies: [{
      type: String,
      enum: ['flip', 'rental', 'wholesale', 'novation', 'subto', 'sellerfinance']
    }],
    cashReady: { type: Boolean, default: false, index: true },
    proofOfFunds: { type: Boolean, default: false, index: true },
    proofOfFundsOnFile: { type: Boolean, default: false }, // Keep for backward compat
    avgCloseDays: { type: Number },
    notes: { type: String },
    active: { type: Boolean, default: true, index: true },
    contactPreferences: {
      sms: { type: Boolean, default: true },
      email: { type: Boolean, default: true }
    },
    optOut: {
      sms: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      updatedAt: { type: Date }
    },
    // SMS-specific opt-out fields (for compliance)
    smsOptOut: { type: Boolean, default: false, index: true },
    smsOptOutAt: { type: Date },
    smsOptOutReason: { type: String },
    // Contact preference
    preferredContact: {
      type: String,
      enum: ['sms', 'email', 'both'],
      default: 'email',
      index: true
    },
    // SMS tracking
    lastSmsSentAt: { type: Date, index: true },
    cooldownHours: { type: Number, default: 72 }, // Hours between blasts
    lastBlastAt: { type: Date },
    engagementScore: { type: Number, min: 0, max: 100, default: 0 }, // 0-100 based on historical engagement
    lastPurchaseDate: { type: Date },
    purchaseMethod: {
      type: String,
      enum: ['cash', 'hard_money', 'other'],
      index: true
    },
    source: {
      type: String,
      enum: ['manual', 'skiptrace', 'import', 'buyer_blast', 'skip_trace', 'deed_records'], // Include old values for backward compat
      default: 'manual',
      index: true
    },
    tags: [{ type: String }],
    confidenceScore: { type: Number, min: 0, max: 100 },
    
    // --- Buyer Quality Scores (from feedback) ---
    responsivenessScore: { type: Number, min: 0, max: 100, default: 50 }, // 0-100 based on response rate
    closeRate: { type: Number, min: 0, max: 1, default: 0.1 }, // 0-1 ratio of interested vs total feedback
    lastResponseAt: { type: Date }, // Timestamp of most recent feedback response
    
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
buyerSchema.index({ markets: 1, propertyTypes: 1 });
buyerSchema.index({ purchaseMethod: 1, markets: 1 });
buyerSchema.index({ lastPurchaseDate: -1 });
buyerSchema.index({ preferredMarkets: 1, propertyTypes: 1 });
buyerSchema.index({ 'optOut.sms': 1, 'optOut.email': 1 });
buyerSchema.index({ lastBlastAt: 1 });
buyerSchema.index({ engagementScore: -1 });
buyerSchema.index({ active: 1, counties: 1, states: 1 });
buyerSchema.index({ active: 1, buyerType: 1 });
buyerSchema.index({ active: 1, minPrice: 1, maxPrice: 1 });
buyerSchema.index({ active: 1, cashReady: 1, proofOfFunds: 1 });
buyerSchema.index({ active: 1, smsOptOut: 1, phone: 1 });
buyerSchema.index({ active: 1, preferredContact: 1, phone: 1 });

module.exports = mongoose.model('Buyer', buyerSchema);
