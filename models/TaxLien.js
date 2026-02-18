// models/TaxLien.js
const mongoose = require("mongoose");

const TaxLienSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    ownerName: String,
    propertyAddress: { type: String, index: true },

    delinquentAmount: String,
    yearsOwed: String,
    propertyValue: String,

    county: String,
    source: { type: String, default: "County Tax Office" },

    trigger: { type: String, default: "Tax Lien" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TaxLien", TaxLienSchema);