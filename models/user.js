// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, unique: true, required: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'manager', 'intake', 'analyst', 'viewer', 'dialer', 'closer'],
      default: 'viewer'
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    phone: { type: String, trim: true, default: null },
    smsOptIn: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Explicit unique index on email (production-grade)
userSchema.index({ email: 1 }, { unique: true });

userSchema.methods.comparePassword = function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

userSchema.statics.hashPassword = async function (pw) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pw, salt);
};

module.exports = mongoose.model('User', userSchema);