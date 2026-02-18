// models/ScoringConfig.js
// Versioned scoring configuration for buy boxes
const mongoose = require('mongoose');

const scoringConfigSchema = new mongoose.Schema(
  {
    marketKey: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    strategy: {
      type: String,
      enum: ['flip', 'buy_hold', 'commercial', 'wholesale', 'other'],
      required: true,
      index: true
    },
    version: {
      type: Number,
      required: true,
      default: 1
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
      index: true
    },
    // Scoring weights (from leadScoringEngine)
    weights: {
      propertyType: { type: Number, default: 20 },
      bedsBaths: { type: Number, default: 15 },
      sqft: { type: Number, default: 10 },
      yearBuilt: { type: Number, default: 10 },
      condition: { type: Number, default: 15 },
      buyPrice: { type: Number, default: 20 },
      arv: { type: Number, default: 10 },
      location: { type: Number, default: 10 }
    },
    // Cash flow assumptions (from cashFlowCalculator)
    assumptions: {
      vacancyRate: { type: Number, default: 0.065 },
      maintenanceRate: { type: Number, default: 0.065 },
      managementRate: { type: Number, default: 0.09 },
      interestRateBuffer: { type: Number, default: 0.0075 },
      baseInterestRate: { type: Number, default: 0.07 }
    },
    // Metadata
    description: {
      type: String
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    activatedAt: {
      type: Date
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    archivedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Compound indexes
scoringConfigSchema.index({ marketKey: 1, strategy: 1, status: 1 });
scoringConfigSchema.index({ marketKey: 1, strategy: 1, version: -1 });

// Ensure only one active config per market+strategy
scoringConfigSchema.index({ marketKey: 1, strategy: 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: 'active' } 
});

module.exports = mongoose.model('ScoringConfig', scoringConfigSchema);

