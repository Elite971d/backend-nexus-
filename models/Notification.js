// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        'lead_assigned',
        'handoff_received',
        'info_requested',
        'buyer_interest',
        'offer_sent',
        'contract_sent',
        'task_due',
        'system',
        'deal_new',
        'deal_assigned'
      ],
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    entityType: {
      type: String,
      enum: ['lead', 'buyer', 'task', 'message', 'deal'],
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'read'],
      default: 'pending',
      index: true
    },
    deliveryAttempts: [{
      channel: { type: String, enum: ['in_app', 'email', 'sms'], required: true },
      status: { type: String, enum: ['queued', 'sent', 'failed'], required: true },
      errorMessage: { type: String, default: null },
      attemptedAt: { type: Date, default: Date.now }
    }],
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
      index: true
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying (Nexus: userId + readAt for badge + delivery)
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);

