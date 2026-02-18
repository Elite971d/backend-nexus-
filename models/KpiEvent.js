// models/KpiEvent.js
const mongoose = require('mongoose');

const kpiEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['dialer', 'closer'],
      required: true,
      index: true
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      index: true
    },
    eventType: {
      type: String,
      enum: [
        'call_made',
        'conversation',
        'intake_completed',
        'handoff_sent',
        'followup_done',
        'offer_sent',
        'contract_sent',
        'contract_signed',
        'buyer_blast_sent',
        'compliance_violation',
        'skip_trace_requested',
        'skip_trace_completed',
        'skip_trace_failed',
        'score_override',
        'score_calculated',
        'lead_routed',
        'routing_override',
        'closer_first_action' // First action by closer on A-grade lead
      ],
      required: true,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

// Index for weekly queries
kpiEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
kpiEventSchema.index({ role: 1, eventType: 1, createdAt: -1 });

module.exports = mongoose.model('KpiEvent', kpiEventSchema);
