// models/CloserKPI.js
const mongoose = require('mongoose');

const closerKPISchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    weekStartDate: {
      type: Date,
      required: true,
      index: true
    },
    weekEndDate: {
      type: Date,
      required: true
    },
    // Activity metrics
    leadsReviewed: { type: Number, default: 0 },
    offersSent: { type: Number, default: 0 },
    buyerBlastsSent: { type: Number, default: 0 },
    contractsSent: { type: Number, default: 0 },
    contractsSigned: { type: Number, default: 0 },
    
    // Performance metrics
    avgResponseTime: { type: Number }, // Average response time in hours (from lead assignment to first action)
    conversionRate: { type: Number }, // 0-100, percentage of leads that convert to contracts
    avgDealSpread: { type: Number }, // Average spread between offer and list price (if available)
    
    // Additional calculated metrics
    offerToContractRate: { type: Number }, // Percentage of offers that lead to contracts
    blastToInterestRate: { type: Number }, // Percentage of blasts that generate interest
    
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Unique index: one KPI record per user per week
closerKPISchema.index({ userId: 1, weekStartDate: 1 }, { unique: true });

// Index for queries
closerKPISchema.index({ weekStartDate: -1 });
closerKPISchema.index({ userId: 1, weekStartDate: -1 });

module.exports = mongoose.model('CloserKPI', closerKPISchema);

