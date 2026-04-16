// models/Property.js — universal property intake + dedupe by normalized address
const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    city: { type: String, default: null },
    state: { type: String, default: null },
    zip: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    propertyAddress: { type: String, required: true },
    normalizedAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ownerName: { type: String, default: '' },
    source: {
      type: [String],
      default: [],
    },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['new', 'contacted', 'hot', 'dead'],
      default: 'new',
      index: true,
    },
    leadType: {
      type: String,
      enum: ['cold', 'warm', 'hot'],
      default: 'cold',
      index: true,
    },
    location: { type: locationSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Property', propertySchema);
