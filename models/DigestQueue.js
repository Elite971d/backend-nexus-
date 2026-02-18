// models/DigestQueue.js
const mongoose = require('mongoose');

const digestQueueSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true,
      unique: true,
      index: true
    },
    items: [{
      leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true
      },
      matchScore: { type: Number },
      createdAt: { type: Date, default: Date.now }
    }],
    lastDigestSentAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
digestQueueSchema.index({ buyerId: 1 });
digestQueueSchema.index({ lastDigestSentAt: 1 });

module.exports = mongoose.model('DigestQueue', digestQueueSchema);
