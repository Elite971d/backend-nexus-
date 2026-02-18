// models/MessageThread.js
const mongoose = require('mongoose');

const messageThreadSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }],
    relatedLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      index: true
    },
    relatedBuyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Buyer',
      index: true
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
messageThreadSchema.index({ participants: 1, lastMessageAt: -1 });
messageThreadSchema.index({ relatedLeadId: 1, lastMessageAt: -1 });
messageThreadSchema.index({ relatedBuyerId: 1, lastMessageAt: -1 });

module.exports = mongoose.model('MessageThread', messageThreadSchema);

