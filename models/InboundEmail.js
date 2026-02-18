// models/InboundEmail.js — Raw email ingestion record (optional pipeline)
const mongoose = require('mongoose');

const inboundEmailSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    messageId: {
      type: String,
      trim: true,
      index: true
    },
    from: { type: String, trim: true },
    to: [{ type: String, trim: true }],
    subject: { type: String, trim: true },
    bodySnippet: { type: String },
    receivedAt: { type: Date, default: Date.now, index: true },
    processedAt: { type: Date, default: null },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

inboundEmailSchema.index({ tenantId: 1, receivedAt: -1 });
inboundEmailSchema.index({ messageId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('InboundEmail', inboundEmailSchema);
