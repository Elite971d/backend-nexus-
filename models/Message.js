// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageThread',
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    senderRole: {
      type: String,
      enum: ['dialer', 'closer', 'admin', 'buyer'],
      required: true
    },
    body: {
      type: String,
      required: true
    },
    channel: {
      type: String,
      enum: ['internal', 'sms', 'email'],
      required: true,
      index: true
    },
    externalAddress: {
      type: String // Phone or email if applicable
    },
    inbound: {
      type: Boolean,
      default: false,
      index: true
    },
    readBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
messageSchema.index({ threadId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ inbound: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);

