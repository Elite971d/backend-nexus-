// models/BuyerFeedback.js
const mongoose = require('mongoose');

const buyerFeedbackSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true,
      index: true
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true
    },
    responseType: {
      type: String,
      enum: ['interested', 'pass', 'price_too_high', 'needs_more_info', 'wrong_market'],
      required: true,
      index: true
    },
    optionalNotes: { type: String },
    source: {
      type: String,
      enum: ['sms', 'email', 'manual'],
      required: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Optional reference to deal blast recipient
    dealBlastRecipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DealBlastRecipient'
    },
    // Optional user who recorded the feedback (if manual)
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
buyerFeedbackSchema.index({ leadId: 1, createdAt: -1 });
buyerFeedbackSchema.index({ buyerId: 1, createdAt: -1 });
buyerFeedbackSchema.index({ responseType: 1, createdAt: -1 });
buyerFeedbackSchema.index({ leadId: 1, responseType: 1 });

module.exports = mongoose.model('BuyerFeedback', buyerFeedbackSchema);

