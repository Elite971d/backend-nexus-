// models/DealNote.js — Notes attached to a deal
const mongoose = require('mongoose');

const dealNoteSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
      required: true,
      index: true
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    body: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true }
);

dealNoteSchema.index({ dealId: 1, createdAt: -1 });
dealNoteSchema.index({ tenantId: 1, dealId: 1 });

module.exports = mongoose.model('DealNote', dealNoteSchema);
