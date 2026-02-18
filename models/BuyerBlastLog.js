// models/BuyerBlastLog.js
const mongoose = require('mongoose');

const buyerBlastLogSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true
    },
    buyerIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true
    }],
    channel: {
      type: String,
      enum: ['sms', 'email', 'digest'],
      required: true,
      index: true
    },
    messagePreview: { type: String },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

// Indexes
buyerBlastLogSchema.index({ leadId: 1, channel: 1, createdAt: -1 });
buyerBlastLogSchema.index({ createdByUserId: 1, createdAt: -1 });
buyerBlastLogSchema.index({ channel: 1, createdAt: -1 });

module.exports = mongoose.model('BuyerBlastLog', buyerBlastLogSchema);
