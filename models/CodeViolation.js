
// models/CodeViolation.js
const mongoose = require("mongoose");

const CodeViolationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    caseNumber: { type: String, index: true },
    propertyAddress: { type: String, index: true },
    violationType: String,
    ownerName: String,
    status: String,

    county: String,
    source: { type: String, default: "City Code Database" },

    trigger: { type: String, default: "Code Violation" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CodeViolation", CodeViolationSchema);
