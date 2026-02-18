// models/BuyBoxRecommendation.js
const mongoose = require('mongoose');

const buyBoxRecommendationSchema = new mongoose.Schema(
  {
    marketKey: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    buyBoxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuyBox',
      required: true,
      index: true
    },
    strategy: {
      type: String,
      enum: ['flip', 'buy_hold', 'commercial', 'wholesale', 'other'],
      required: true,
      index: true
    },
    recommendationType: {
      type: String,
      enum: [
        'rent_threshold',
        'cap_rate_threshold',
        'price_ceiling',
        'rehab_cap',
        'dscr_minimum',
        'vacancy_assumption',
        'expense_assumption',
        'scoring_weight_adjustment',
        'exclusion_rule',
        'city_override_adjustment'
      ],
      required: true
    },
    currentValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    recommendedValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    evidenceSummary: {
      type: String,
      required: true
    },
    evidenceMetrics: {
      sampleSize: {
        type: Number,
        required: true,
        min: 0
      },
      winRate: {
        type: Number,
        min: 0,
        max: 100
      }, // A/B outcomes percentage
      lossRate: {
        type: Number,
        min: 0,
        max: 100
      }, // C/D outcomes percentage
      avgCashFlowVariance: {
        type: Number
      },
      avgDSCRVariance: {
        type: Number
      },
      medianCashFlow: {
        type: Number
      },
      medianDSCR: {
        type: Number
      },
      tailRiskPct: {
        type: Number,
        min: 0,
        max: 100
      }, // Percent of negative cash flow
      reasoning: [{
        type: String
      }]
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    createdBy: {
      type: String,
      default: 'system',
      enum: ['system', 'admin', 'manager']
    },
    status: {
      type: String,
      enum: ['proposed', 'reviewed', 'accepted', 'rejected'],
      default: 'proposed',
      index: true
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: {
      type: Date
    },
    decisionNote: {
      type: String
    }
  },
  { timestamps: true }
);

// Compound indexes for efficient querying
buyBoxRecommendationSchema.index({ marketKey: 1, buyBoxId: 1, createdAt: -1 });
buyBoxRecommendationSchema.index({ status: 1, createdAt: -1 });
buyBoxRecommendationSchema.index({ marketKey: 1, strategy: 1, status: 1 });

module.exports = mongoose.model('BuyBoxRecommendation', buyBoxRecommendationSchema);

