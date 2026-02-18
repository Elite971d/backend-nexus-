// models/DealBlastRecipient.js
const mongoose = require('mongoose');

const dealBlastRecipientSchema = new mongoose.Schema(
  {
    dealBlastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DealBlast',
      required: true,
      index: true
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true,
      index: true
    },
    channel: {
      type: String,
      enum: ['internal', 'sms', 'email'],
      required: true
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'failed', 'replied', 'interested', 'not_interested', 'opted_out'],
      default: 'queued',
      required: true,
      index: true
    },
    sentAt: { type: Date },
    respondedAt: { type: Date },
    responseText: { type: String },
    tracking: {
      messageId: { type: String },
      provider: { type: String }
    },
    reasonExcluded: { type: String }, // If buyer was excluded from matching, reason here
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Indexes
dealBlastRecipientSchema.index({ dealBlastId: 1, status: 1 });
dealBlastRecipientSchema.index({ buyerId: 1, sentAt: -1 });
dealBlastRecipientSchema.index({ dealBlastId: 1, buyerId: 1 }, { unique: true });

module.exports = mongoose.model('DealBlastRecipient', dealBlastRecipientSchema);

