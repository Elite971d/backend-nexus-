// models/DealPerformance.js
const mongoose = require('mongoose');

const dealPerformanceSchema = new mongoose.Schema(
  {
    // Core identifiers
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true,
      index: true
    },
    strategy: {
      type: String,
      enum: ['buy_hold', 'commercial'],
      required: true,
      index: true
    },
    marketKey: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    
    // Deal close information
    closedDate: {
      type: Date,
      required: true,
      index: true
    },
    purchasePrice: {
      type: Number,
      required: true
    },
    rehabCostActual: {
      type: Number,
      default: 0
    },
    
    // Financing details
    financing: {
      loanType: {
        type: String,
        enum: ['DSCR', 'conventional', 'commercial', 'cash'],
        required: true
      },
      interestRate: {
        type: Number,
        required: true,
        min: 0,
        max: 1
      },
      ltv: {
        type: Number,
        required: true,
        min: 0,
        max: 1
      },
      amortization: {
        type: Number,
        required: true,
        min: 1
      }
    },
    
    // PRO FORMA SNAPSHOT (LOCKED AT CLOSE - IMMUTABLE)
    proForma: {
      projectedRent: {
        type: Number,
        required: true
      },
      projectedNOI: {
        type: Number,
        required: true
      },
      projectedMonthlyCashFlow: {
        type: Number,
        required: true
      },
      projectedDSCR: {
        type: Number,
        required: true
      },
      assumptionsUsed: [{
        type: String
      }],
      lockedAt: {
        type: Date,
        default: Date.now
      },
      lockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    },
    
    // ACTUAL PERFORMANCE (PERIODIC UPDATES)
    actualPerformance: [{
      reportingPeriod: {
        month: {
          type: Number,
          required: true,
          min: 1,
          max: 12
        },
        year: {
          type: Number,
          required: true,
          min: 2000
        }
      },
      actualRentCollected: {
        type: Number,
        required: true,
        default: 0
      },
      actualVacancyRate: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
      },
      actualExpenses: {
        maintenance: { type: Number, default: 0 },
        propertyManagement: { type: Number, default: 0 },
        taxes: { type: Number, default: 0 },
        insurance: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
      },
      actualNOI: {
        type: Number,
        required: true
      },
      actualMonthlyCashFlow: {
        type: Number,
        required: true
      },
      actualDSCR: {
        type: Number,
        required: true
      },
      
      // Variance metrics (auto-calculated)
      cashFlowVariance: {
        type: Number,
        default: 0
      },
      dscrVariance: {
        type: Number,
        default: 0
      },
      rentVariance: {
        type: Number,
        default: 0
      },
      expenseVariance: {
        type: Number,
        default: 0
      },
      
      // Status and flags
      performanceGrade: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        required: true
      },
      flags: [{
        type: String
      }],
      notes: {
        type: String
      },
      
      // Audit trail
      enteredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      enteredAt: {
        type: Date,
        default: Date.now
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Current status (latest period)
    currentStatus: {
      performanceGrade: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        index: true
      },
      flags: [{
        type: String
      }],
      notes: {
        type: String
      },
      lastUpdated: {
        type: Date
      }
    },
    
    // Buy Box reference (for feedback loops)
    buyBoxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuyBox',
      index: true
    }
  },
  { timestamps: true }
);

// Compound indexes for efficient querying
dealPerformanceSchema.index({ leadId: 1, strategy: 1 });
dealPerformanceSchema.index({ buyerId: 1, strategy: 1 });
dealPerformanceSchema.index({ marketKey: 1, strategy: 1 });
dealPerformanceSchema.index({ closedDate: -1 });
dealPerformanceSchema.index({ 'currentStatus.performanceGrade': 1 });
dealPerformanceSchema.index({ buyBoxId: 1, 'currentStatus.performanceGrade': 1 });

// Pre-save hook to calculate variance metrics and performance grade
dealPerformanceSchema.pre('save', function(next) {
  // Only calculate if we have pro forma and actual performance data
  if (this.proForma && this.proForma.projectedMonthlyCashFlow !== undefined && 
      this.actualPerformance && this.actualPerformance.length > 0) {
    const latest = this.actualPerformance[this.actualPerformance.length - 1];
    
    // Only calculate if latest period has required data
    if (latest.actualMonthlyCashFlow !== undefined && latest.actualDSCR !== undefined) {
      // Calculate variances
      latest.cashFlowVariance = latest.actualMonthlyCashFlow - this.proForma.projectedMonthlyCashFlow;
      latest.dscrVariance = latest.actualDSCR - this.proForma.projectedDSCR;
      latest.rentVariance = latest.actualRentCollected - this.proForma.projectedRent;
      
      // Calculate expense variance (total expenses vs projected)
      const projectedExpenses = this.proForma.projectedNOI - this.proForma.projectedMonthlyCashFlow;
      const actualTotalExpenses = latest.actualExpenses?.total || 0;
      latest.expenseVariance = actualTotalExpenses - projectedExpenses;
      
      // Calculate performance grade
      const { calculatePerformanceGrade } = require('../utils/performanceGrading');
      latest.performanceGrade = calculatePerformanceGrade(
        latest.actualMonthlyCashFlow,
        this.proForma.projectedMonthlyCashFlow,
        latest.actualDSCR,
        this.proForma.projectedDSCR
      );
      
      // Update current status
      this.currentStatus = {
        performanceGrade: latest.performanceGrade,
        flags: latest.flags || [],
        notes: latest.notes || '',
        lastUpdated: latest.updatedAt || latest.enteredAt || new Date()
      };
    }
  } else if (!this.proForma || !this.proForma.lockedAt) {
    // If no pro forma yet, clear current status
    this.currentStatus = {
      performanceGrade: null,
      flags: [],
      notes: '',
      lastUpdated: null
    };
  }
  
  next();
});

// Method to get latest performance period
dealPerformanceSchema.methods.getLatestPerformance = function() {
  if (!this.actualPerformance || this.actualPerformance.length === 0) {
    return null;
  }
  return this.actualPerformance[this.actualPerformance.length - 1];
};

// Method to check if pro forma is locked (immutable)
dealPerformanceSchema.methods.isProFormaLocked = function() {
  return !!this.proForma.lockedAt;
};

module.exports = mongoose.model('DealPerformance', dealPerformanceSchema);

