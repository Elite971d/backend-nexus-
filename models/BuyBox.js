// models/BuyBox.js
const mongoose = require('mongoose');

const buyBoxSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    marketKey: {
      type: String,
      required: true,
      index: true,
      trim: true
    }, // e.g. TX-DFW, CA-LA, WA-SEATTLE
    label: {
      type: String,
      required: true,
      trim: true
    }, // "DFW Quick Flip Buy Box"
    propertyType: [{
      type: String,
      enum: ['SFR', 'MF', 'Land', 'Commercial'],
      required: true
    }],
    minBeds: { type: Number },
    minBaths: { type: Number },
    minSqft: { type: Number },
    minYearBuilt: { type: Number },
    conditionAllowed: [{
      type: String,
      enum: ['light', 'medium', 'heavy', '1', '2', '3', '4', '5']
    }],
    buyPriceMin: { type: Number, required: true },
    buyPriceMax: { type: Number, required: true },
    arvMin: { type: Number },
    arvMax: { type: Number },
    counties: [{
      type: String,
      trim: true
    }],
    cityOverrides: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }, // e.g. { "McKinney": { buyPriceMin: 120000, buyPriceMax: 280000 } }
    exclusions: [{
      type: String,
      trim: true
    }], // e.g. ["major fire damage", "extreme structural damage"]
    strategy: {
      type: String,
      enum: ['flip', 'buy_hold', 'commercial', 'wholesale', 'other'],
      default: 'flip'
    }, // Strategy type - buy_hold and commercial require cash flow
    requiresPositiveCashFlow: {
      type: Boolean,
      default: false
    }, // If true, cash flow must be positive for this buy box
    cashFlowConfig: {
      loanType: {
        type: String,
        enum: ['DSCR', 'conventional', 'commercial'],
        default: 'DSCR'
      },
      ltv: {
        type: Number,
        default: 0.75,
        min: 0,
        max: 1
      },
      interestRate: {
        type: Number,
        min: 0,
        max: 1
      }, // If not provided, uses default with buffer
      amortization: {
        type: Number,
        default: 30
      },
      requiredDscr: {
        type: Number,
        default: 1.25,
        min: 1.0
      },
      maintenanceReserve: Number, // Override default maintenance reserve
      vacancyReserve: Number, // Override default vacancy reserve
      propertyManagement: Number // Override default property management
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

// Index for efficient querying by market and active status
buyBoxSchema.index({ marketKey: 1, active: 1 });

module.exports = mongoose.model('BuyBox', buyBoxSchema);

