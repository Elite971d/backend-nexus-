// models/Deal.js — Nexus deal pipeline (email, website, referral, manual, zoho)
const mongoose = require('mongoose');

const DEAL_SOURCE = ['email', 'website', 'referral', 'manual', 'zoho'];
const DEAL_STATUS = [
  'new',
  'reviewing',
  'underwriting',
  'offer_sent',
  'under_contract',
  'closed',
  'dead'
];
const DEAL_PRIORITY = ['low', 'normal', 'high'];

const dealSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    source: {
      type: String,
      enum: DEAL_SOURCE,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: DEAL_STATUS,
      default: 'new',
      required: true,
      index: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    priority: {
      type: String,
      enum: DEAL_PRIORITY,
      default: 'normal',
      index: true
    },
    // Sender / email context
    senderName: { type: String, trim: true },
    senderEmail: { type: String, lowercase: true, trim: true },
    subject: { type: String, trim: true },
    bodySnippet: { type: String },
    // Property (optional)
    property: {
      address: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true, maxlength: 2 },
      zip: { type: String, trim: true },
      county: { type: String, trim: true }
    },
    // Numbers (optional)
    numbers: {
      askingPrice: { type: Number, min: 0 },
      arv: { type: Number, min: 0 },
      rehabEstimate: { type: Number, min: 0 }
    }
  },
  { timestamps: true }
);

// Required indexes for Nexus
dealSchema.index({ status: 1 });
dealSchema.index({ assignedTo: 1 });
dealSchema.index({ createdAt: -1 });
dealSchema.index({ tenantId: 1, status: 1 });
dealSchema.index({ tenantId: 1, assignedTo: 1, createdAt: -1 });
dealSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Deal', dealSchema);
module.exports.DEAL_SOURCE = DEAL_SOURCE;
module.exports.DEAL_STATUS = DEAL_STATUS;
module.exports.DEAL_PRIORITY = DEAL_PRIORITY;
