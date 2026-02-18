// models/Tenant.js
const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    brandName: {
      type: String,
      default: ''
    },
    logoUrl: {
      type: String,
      default: ''
    },
    primaryColor: {
      type: String,
      default: '#0b1d51'
    },
    secondaryColor: {
      type: String,
      default: '#ff6f00'
    }
  },
  { timestamps: true }
);

// Index for efficient queries
tenantSchema.index({ slug: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);

