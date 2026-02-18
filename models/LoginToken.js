// models/LoginToken.js — Single-use magic-link tokens (hashed before storage)
const mongoose = require('mongoose');

const loginTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoginToken', loginTokenSchema);
