// utils/performanceGrading.js
// Performance grading logic for post-close deal tracking

/**
 * Calculate performance grade based on actual vs projected metrics
 * @param {number} actualCashFlow - Actual monthly cash flow
 * @param {number} projectedCashFlow - Projected monthly cash flow
 * @param {number} actualDSCR - Actual DSCR
 * @param {number} projectedDSCR - Projected DSCR (or minimum required DSCR)
 * @param {number} minDSCR - Minimum required DSCR (default: 1.25)
 * @returns {string} Grade: 'A', 'B', 'C', or 'D'
 */
function calculatePerformanceGrade(actualCashFlow, projectedCashFlow, actualDSCR, projectedDSCR, minDSCR = 1.25) {
  // Use projectedDSCR as minimum if provided, otherwise use minDSCR
  const requiredDSCR = projectedDSCR || minDSCR;
  
  // Grade D: Negative cash flow OR DSCR failure
  if (actualCashFlow < 0 || actualDSCR < requiredDSCR) {
    return 'D';
  }
  
  // Calculate cash flow variance percentage
  const cashFlowVariancePercent = projectedCashFlow !== 0 
    ? ((actualCashFlow - projectedCashFlow) / Math.abs(projectedCashFlow)) * 100
    : 0;
  
  // Grade A: Actual cash flow >= projected AND DSCR meets or exceeds minimum
  if (actualCashFlow >= projectedCashFlow && actualDSCR >= requiredDSCR) {
    return 'A';
  }
  
  // Grade B: Cash flow within -10% of projected AND DSCR slightly below target but positive
  if (cashFlowVariancePercent >= -10 && actualCashFlow > 0 && actualDSCR >= (requiredDSCR * 0.9)) {
    return 'B';
  }
  
  // Grade C: Cash flow positive but materially below projection OR expense/vacancy issues
  // (Cash flow is positive but more than -10% below projection, OR DSCR is below 90% of required)
  if (actualCashFlow > 0) {
    return 'C';
  }
  
  // Fallback to D (shouldn't reach here due to first check, but safety net)
  return 'D';
}

/**
 * Generate performance flags based on variance analysis
 * @param {Object} performance - Performance data object
 * @param {Object} proForma - Pro forma snapshot
 * @returns {Array<string>} Array of flag strings
 */
function generatePerformanceFlags(performance, proForma) {
  const flags = [];
  
  // Cash flow flags
  const cashFlowVariancePercent = proForma.projectedMonthlyCashFlow !== 0
    ? ((performance.actualMonthlyCashFlow - proForma.projectedMonthlyCashFlow) / Math.abs(proForma.projectedMonthlyCashFlow)) * 100
    : 0;
  
  if (cashFlowVariancePercent < -20) {
    flags.push('significant_cash_flow_shortfall');
  } else if (cashFlowVariancePercent < -10) {
    flags.push('moderate_cash_flow_shortfall');
  }
  
  // DSCR flags
  const dscrVariance = performance.actualDSCR - proForma.projectedDSCR;
  if (dscrVariance < -0.2) {
    flags.push('dscr_below_projection');
  }
  if (performance.actualDSCR < 1.25) {
    flags.push('dscr_below_minimum');
  }
  
  // Rent flags
  const rentVariancePercent = proForma.projectedRent !== 0
    ? ((performance.actualRentCollected - proForma.projectedRent) / proForma.projectedRent) * 100
    : 0;
  
  if (rentVariancePercent < -15) {
    flags.push('rent_collection_shortfall');
  }
  
  // Vacancy flags
  if (performance.actualVacancyRate > 0.1) {
    flags.push('high_vacancy_rate');
  } else if (performance.actualVacancyRate > 0.05) {
    flags.push('elevated_vacancy_rate');
  }
  
  // Expense flags
  const expenseVariancePercent = (proForma.projectedNOI - proForma.projectedMonthlyCashFlow) !== 0
    ? ((performance.actualExpenses.total - (proForma.projectedNOI - proForma.projectedMonthlyCashFlow)) / Math.abs(proForma.projectedNOI - proForma.projectedMonthlyCashFlow)) * 100
    : 0;
  
  if (expenseVariancePercent > 20) {
    flags.push('expense_overrun');
  }
  
  return flags;
}

/**
 * Calculate aggregate performance metrics for a buy box
 * @param {Array<Object>} performances - Array of DealPerformance documents
 * @returns {Object} Aggregate metrics
 */
function calculateBuyBoxPerformanceMetrics(performances) {
  if (!performances || performances.length === 0) {
    return {
      totalDeals: 0,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0 },
      averageCashFlowVariance: 0,
      averageDSCRVariance: 0,
      averageRentVariance: 0,
      averageExpenseVariance: 0,
      performanceRate: 0 // Percentage of A/B grades
    };
  }
  
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0 };
  let totalCashFlowVariance = 0;
  let totalDSCRVariance = 0;
  let totalRentVariance = 0;
  let totalExpenseVariance = 0;
  let validCashFlowCount = 0;
  let validDSCRCount = 0;
  let validRentCount = 0;
  let validExpenseCount = 0;
  let aOrBGrades = 0;
  
  performances.forEach(perf => {
    const latest = perf.getLatestPerformance();
    if (!latest) return;
    
    // Count grades
    if (latest.performanceGrade) {
      gradeDistribution[latest.performanceGrade] = (gradeDistribution[latest.performanceGrade] || 0) + 1;
      if (latest.performanceGrade === 'A' || latest.performanceGrade === 'B') {
        aOrBGrades++;
      }
    }
    
    // Sum variances
    if (latest.cashFlowVariance !== null && latest.cashFlowVariance !== undefined) {
      totalCashFlowVariance += latest.cashFlowVariance;
      validCashFlowCount++;
    }
    if (latest.dscrVariance !== null && latest.dscrVariance !== undefined) {
      totalDSCRVariance += latest.dscrVariance;
      validDSCRCount++;
    }
    if (latest.rentVariance !== null && latest.rentVariance !== undefined) {
      totalRentVariance += latest.rentVariance;
      validRentCount++;
    }
    if (latest.expenseVariance !== null && latest.expenseVariance !== undefined) {
      totalExpenseVariance += latest.expenseVariance;
      validExpenseCount++;
    }
  });
  
  return {
    totalDeals: performances.length,
    gradeDistribution,
    averageCashFlowVariance: validCashFlowCount > 0 ? totalCashFlowVariance / validCashFlowCount : 0,
    averageDSCRVariance: validDSCRCount > 0 ? totalDSCRVariance / validDSCRCount : 0,
    averageRentVariance: validRentCount > 0 ? totalRentVariance / validRentCount : 0,
    averageExpenseVariance: validExpenseCount > 0 ? totalExpenseVariance / validExpenseCount : 0,
    performanceRate: performances.length > 0 ? (aOrBGrades / performances.length) * 100 : 0
  };
}

module.exports = {
  calculatePerformanceGrade,
  generatePerformanceFlags,
  calculateBuyBoxPerformanceMetrics
};

