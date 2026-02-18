// models/Lead.js
const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    // --- Multi-tenant ---
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    },
    // --- Core identity & origin ---
    source: { type: String },          // preforeclosure, tax, email, manual, etc.
    category: { type: String },        // Probate, Divorce, Wholesale Email, etc.
    createdFrom: String,               // "email_scraper", "county_scraper", "manual"
    rawEmailId: { type: String, index: true },
    dedupeKey: { type: String, required: true, index: true }, // Remove unique, make tenant-scoped
    caseNumber: { type: String },      // For county records (probate, code violations, etc.)
    alertedAt: { type: Date },        // Timestamp when SMS alert was sent

    // --- Owner / property ---
    ownerName: { type: String },
    propertyAddress: { type: String },
    mailingAddress: { type: String },
    city: String,
    state: String,
    zip: String,
    county: String,

    // --- Numbers / deal terms ---
    askingPrice: Number,
    listPrice: Number,
    delinquentAmount: Number,   // from tax / preforeclosure
    arv: Number,                // when you compute ARV later
    beds: Number,
    baths: Number,
    sqft: Number,
    yearBuilt: Number,
    lotSizeSqft: Number,

    // --- Extra wholesale / title info ---
    closingDate: String,        // keep as string (emails are messy)
    titleCompany: String,
    lockboxCode: String,
    assignmentFee: Number,

    // --- CRM state ---
    status: {
      type: String,
      enum: ["new", "attempted", "contacted", "under_contract", "dead"],
      default: "new"
    },

    tags: [String],
    nextFollowUp: Date,
    notes: String,
    description: String,

    // --- Scoring & metadata ---
    score: { type: Number, default: 0 },  // 0–100 based on buy box fit (legacy, kept for backward compatibility)
    leadTier: {
      type: String,
      enum: ['hot', 'warm', 'cold'],
      default: 'cold'
    },
    leadScore: {
      score: { type: Number, default: 0, min: 0, max: 100 },
      grade: {
        type: String,
        enum: ['A', 'B', 'C', 'D', 'Dead'],
        default: 'Dead'
      },
      buyBoxKey: { type: String }, // e.g. "TX-DFW"
      buyBoxId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuyBox' },
      buyBoxLabel: { type: String },
      evaluatedAt: { type: Date },
      reasons: [{ type: String }], // Positive scoring factors
      failedChecks: [{ type: String }], // Failed criteria
      cashFlow: {
        monthlyCashFlow: { type: Number },
        annualCashFlow: { type: Number },
        dscr: { type: Number },
        cashFlowPass: { type: Boolean, default: false },
        dscrPass: { type: Boolean, default: false },
        calculatedAt: { type: Date },
        assumptionsUsed: [{ type: String }],
        breakdown: { type: mongoose.Schema.Types.Mixed }
      },
      override: {
        grade: { type: String, enum: ['A', 'B', 'C', 'D', 'Dead'] },
        reason: { type: String },
        overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        overriddenAt: { type: Date }
      }
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // --- Rapid Offer System ---
    dialerIntake: {
      propertyAddress: { type: String },
      propertyType: { type: String },
      occupancyType: {
        type: String,
        enum: ['vacant', 'owner', 'tenant', 'unknown'],
        required: false
      },
      conditionTier: {
        type: String,
        enum: ['light', 'medium', 'heavy', '1', '2', '3', '4', '5'],
        required: false
      },
      askingPrice: { type: Number },
      mortgageFreeAndClear: {
        type: String,
        enum: ['yes', 'no', 'unknown'],
        required: false
      },
      mortgageBalance: { type: Number },
      mortgageMonthlyPayment: { type: Number },
      mortgageCurrent: {
        type: String,
        enum: ['yes', 'no', 'unknown'],
        required: false
      },
      motivationRating: { type: Number, min: 1, max: 5 },
      timelineToClose: { type: String },
      sellerReason: { type: String },
      sellerFlexibility: {
        type: String,
        enum: ['price', 'terms', 'both', 'unknown'],
        required: false
      },
      redFlags: [{ type: String }],
      dialerConfidence: { type: Number, min: 1, max: 5 },
      recommendedOfferLane: {
        type: String,
        enum: ['cash', 'subto', 'sellerfinance', 'novation', 'leaseoption', 'unknown']
      },
      recordingDisclosureGiven: { type: Boolean, default: false },
      offshoreModeUsed: { type: Boolean, default: false },
      intakeCompletedAt: { type: Date },
      intakeLocked: { type: Boolean, default: false }
    },
    handoff: {
      status: {
        type: String,
        enum: ['none', 'ready_for_closer', 'closer_review', 'back_to_dialer', 'offer_sent', 'contract_sent', 'under_contract', 'dead'],
        default: 'none'
      },
      handoffSummary: { type: String },
      missingFields: [{ type: String }],
      sentToCloserAt: { type: Date },
      sentToCloserBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      closerRequestedInfoAt: { type: Date },
      closerRequestedInfoNote: { type: String }
    },
    closer: {
      offerLaneFinal: {
        type: String,
        enum: ['cash', 'subto', 'sellerfinance', 'novation', 'leaseoption', 'unknown']
      },
      offerTermsSummary: { type: String },
      offerAmount: { type: Number },
      loiOptions: [{ type: String }],
      followupSchedule: { type: String },
      disposition: {
        type: String,
        enum: ['contract_sent', 'negotiating', 'dead', 'followup']
      },
      offerSentAt: { type: Date },
      contractSentAt: { type: Date },
      underContractAt: { type: Date }
    },

    // --- Skip Trace & Data Enrichment ---
    // Top-level fields for easy access
    phones: [{ type: String }], // Simple array of phone numbers
    emails: [{ type: String }], // Simple array of email addresses
    skipTraceStatus: {
      type: String,
      enum: ['pending', 'completed', 'no_data'],
      default: null
    },
    skipTraceSources: [{ type: String }], // Array of provider names that contributed data
    lastSkipTracedAt: { type: Date },
    
    skipTrace: {
      status: {
        type: String,
        enum: ['not_requested', 'pending', 'completed', 'no_data', 'failed'],
        default: 'not_requested'
      },
      requestedAt: { type: Date },
      completedAt: { type: Date },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      provider: { type: String },
      confidenceScore: { type: Number, min: 0, max: 100 },
      phones: [{
        number: { type: String, required: true },
        type: {
          type: String,
          enum: ['mobile', 'landline', 'voip', 'unknown'],
          default: 'unknown'
        },
        confidence: { type: Number, min: 0, max: 100 },
        lastSeen: { type: Date }
      }],
      emails: [{
        email: { type: String, required: true },
        confidence: { type: Number, min: 0, max: 100 },
        lastSeen: { type: Date }
      }],
      mailingAddresses: [{
        address: { type: String, required: true },
        confidence: { type: Number, min: 0, max: 100 },
        lastSeen: { type: Date }
      }],
      entityInfo: {
        isLLC: { type: Boolean },
        entityName: { type: String },
        registeredState: { type: String }
      },
      notes: { type: String }
    },
    skipTraceLocked: { type: Boolean, default: false },
    skipTraceCost: { type: Number },

    // --- Deal Routing ---
    routing: {
      route: {
        type: String,
        enum: ['immediate_closer', 'dialer_priority', 'nurture', 'archive'],
        index: true
      },
      priorityLevel: {
        type: String,
        enum: ['urgent', 'high', 'normal', 'low'],
        index: true
      },
      routedAt: { type: Date },
      routedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null = system
      routingReasons: [{ type: String }],
      routingReason: { type: String }, // Specific reason for routing (e.g., "Failed cash flow rule")
      slaHours: { type: Number }, // SLA in hours for this route
      previousRoute: { type: String },
      previousPriority: { type: String },
      override: {
        route: { type: String },
        priorityLevel: { type: String },
        reason: { type: String },
        overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        overriddenAt: { type: Date },
        previousRoute: { type: String },
        previousPriority: { type: String }
      },
      routingAlertedAt: { type: Date } // Timestamp when routing alert was sent (prevents duplicate alerts)
    },

    // --- Price Discovery (from buyer feedback) ---
    buyerInterestScore: { type: Number, min: 0, max: 100 }, // 0-100 based on buyer feedback
    suggestedPriceRange: {
      min: { type: Number },
      max: { type: Number },
      suggested: { type: Number },
      current: { type: Number },
      adjustmentPercent: { type: Number }
    },
    lastPriceDiscoveryAt: { type: Date },

    // --- AI Deal Underwriting Assistant ---
    underwriting: {
      summaryText: { type: String },
      suggestedLane: {
        type: String,
        enum: ['cash', 'subto', 'sellerfinance', 'novation', 'leaseoption', 'unknown']
      },
      suggestedPriceRange: {
        min: { type: Number },
        max: { type: Number }
      },
      assumptions: [{ type: String }],
      missingFields: [{ type: String }],
      risks: [{ type: String }],
      aiUsed: { type: Boolean, default: false },
      model: { type: String }, // e.g., 'gpt-4', 'rules-only'
      createdAt: { type: Date },
      updatedAt: { type: Date },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lead", leadSchema);