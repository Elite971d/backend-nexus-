// models/DealBlast.js
const mongoose = require('mongoose');

const dealBlastSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true
    },
    marketKey: {
      type: String,
      required: true,
      index: true
    },
    gradeAtBlast: {
      type: String,
      enum: ['A', 'B', 'C', 'D', 'Dead'],
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    channel: {
      type: String,
      enum: ['internal', 'sms', 'email'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'canceled'],
      default: 'draft',
      required: true,
      index: true
    },
    messageTemplateKey: {
      type: String,
      required: true
    },
    sentAt: { type: Date },
    stats: {
      recipients: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      replies: { type: Number, default: 0 },
      interested: { type: Number, default: 0 },
      notInterested: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

// Indexes
dealBlastSchema.index({ leadId: 1, status: 1 });
dealBlastSchema.index({ createdBy: 1, createdAt: -1 });
dealBlastSchema.index({ channel: 1, status: 1 });

module.exports = mongoose.model('DealBlast', dealBlastSchema);

