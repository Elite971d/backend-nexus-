// models/Probate.js
const mongoose = require("mongoose");

const ProbateSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    caseNumber: { type: String, index: true },
    executorName: String,
    attorneyName: String,
    estateAddress: { type: String, index: true },

    county: String,
    source: { type: String, default: "County Probate Court" },

    trigger: { type: String, default: "Probate" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Probate", ProbateSchema);