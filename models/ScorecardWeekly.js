// models/ScorecardWeekly.js
const mongoose = require('mongoose');

const scorecardWeeklySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['dialer', 'closer'],
      required: true
    },
    weekStart: {
      type: Date,
      required: true,
      index: true
    },
    weekEnd: {
      type: Date,
      required: true
    },
    // 100-point scorecard breakdown
    intakeAccuracy: { type: Number, default: 0 }, // 30 points
    callControl: { type: Number, default: 0 }, // 20 points
    scriptAdherence: { type: Number, default: 0 }, // 20 points
    compliance: { type: Number, default: 0 }, // 20 points
    professionalism: { type: Number, default: 0 }, // 10 points
    totalScore: { type: Number, default: 0 }, // 0-100
    certificationStatus: {
      type: String,
      enum: ['certified', 'conditional', 'retraining_required'],
      default: 'conditional'
    },
    // Activity metrics
    callsMade: { type: Number, default: 0 },
    conversations: { type: Number, default: 0 },
    intakesCompleted: { type: Number, default: 0 },
    handoffsSent: { type: Number, default: 0 },
    complianceViolations: { type: Number, default: 0 },
    // Manager override fields (for manual scoring)
    managerNotes: { type: String },
    managerOverrideScore: { type: Number },
    computedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Unique index for one scorecard per user per week
scorecardWeeklySchema.index({ userId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('ScorecardWeekly', scorecardWeeklySchema);
