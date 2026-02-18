// models/PreForeclosure.js
const mongoose = require("mongoose");

const PreForeclosureSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    ownerName: String,
    propertyAddress: { type: String, index: true },
    mailingAddress: String,

    amountDelinquent: String,
    auctionDate: String,

    county: String,
    source: { type: String, default: "County Clerk" },

    trigger: { type: String, default: "Pre-Foreclosure" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PreForeclosure", PreForeclosureSchema);