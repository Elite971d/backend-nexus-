// models/ActivityLog.js — Audit trail for entity changes
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    entityType: {
      type: String,
      required: true,
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Required index: entityId, createdAt (for audit by entity)
activityLogSchema.index({ entityId: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
