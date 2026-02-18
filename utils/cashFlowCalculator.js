// utils/cashFlowCalculator.js
// Cash Flow Calculation Engine for Buy & Hold and Commercial strategies

/**
 * Calculate cash flow for a property using conservative assumptions
 * @param {Object} inputs - Property and financial inputs
 * @param {Object} options - Configuration options
 * @returns {Object} Cash flow calculation results
 */
function calculateCashFlow(inputs, options = {}) {
  const {
    purchasePrice,
    rehabCost = 0,
    estimatedRent,
    noi, // Net Operating Income (alternative to estimatedRent)
    taxes = 0,
    insurance = 0,
    maintenanceReserve = null, // If provided, use it; otherwise calculate
    vacancyReserve = null, // If provided, use it; otherwise calculate
    propertyManagement = null, // If provided, use it; otherwise calculate
    interestRate = null, // If provided, use it; otherwise use default
    loanType = 'DSCR', // DSCR, conventional, commercial
    ltv = 0.75, // Loan-to-value ratio (default 75%)
    amortization = 30, // Years
    requiredDscr = 1.25 // Minimum DSCR required (default 1.25)
  } = inputs;

  // Default configuration
  const defaults = {
    vacancyRate: 0.065, // 6.5% default (5-8% range)
    maintenanceRate: 0.065, // 6.5% default (5-8% range)
    managementRate: 0.09, // 9% default (8-10% range)
    interestRateBuffer: 0.0075, // 0.75% buffer (0.5-1% range)
    baseInterestRate: 0.07 // 7% base rate
  };

  const config = {
    vacancyRate: options.vacancyRate ?? defaults.vacancyRate,
    maintenanceRate: options.maintenanceRate ?? defaults.maintenanceRate,
    managementRate: options.managementRate ?? defaults.managementRate,
    interestRateBuffer: options.interestRateBuffer ?? defaults.interestRateBuffer,
    baseInterestRate: options.baseInterestRate ?? defaults.baseInterestRate
  };

  // Calculate total acquisition cost
  const totalAcquisitionCost = purchasePrice + (rehabCost || 0);
  const loanAmount = totalAcquisitionCost * ltv;
  const downPayment = totalAcquisitionCost - loanAmount;

  // Determine interest rate (with conservative buffer)
  let effectiveInterestRate;
  if (interestRate !== null && interestRate !== undefined) {
    effectiveInterestRate = interestRate + config.interestRateBuffer;
  } else {
    effectiveInterestRate = config.baseInterestRate + config.interestRateBuffer;
  }

  // Calculate monthly mortgage payment
  const monthlyRate = effectiveInterestRate / 12;
  const numPayments = amortization * 12;
  let monthlyPayment = 0;
  if (loanAmount > 0) {
    monthlyPayment = loanAmount * 
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
      (Math.pow(1 + monthlyRate, numPayments) - 1);
  }

  // Calculate gross monthly income
  let grossMonthlyIncome;
  if (noi !== null && noi !== undefined) {
    // If NOI provided, back-calculate gross income
    // NOI = Gross Income - Operating Expenses (excluding debt service)
    // For estimation: Gross Income ≈ NOI / (1 - vacancy - management - maintenance)
    const expenseRatio = config.vacancyRate + config.managementRate + config.maintenanceRate;
    grossMonthlyIncome = (noi / 12) / (1 - expenseRatio);
  } else if (estimatedRent) {
    grossMonthlyIncome = estimatedRent;
  } else {
    // Cannot calculate without income
    return {
      monthlyCashFlow: null,
      annualCashFlow: null,
      dscr: null,
      cashFlowPass: false,
      dscrPass: false,
      assumptionsUsed: [],
      error: 'Missing required input: estimatedRent or noi'
    };
  }

  // Calculate operating expenses
  const vacancyReserveAmount = vacancyReserve !== null 
    ? vacancyReserve 
    : grossMonthlyIncome * config.vacancyRate;
  
  const maintenanceReserveAmount = maintenanceReserve !== null
    ? maintenanceReserve
    : grossMonthlyIncome * config.maintenanceRate;
  
  const propertyManagementAmount = propertyManagement !== null
    ? propertyManagement
    : grossMonthlyIncome * config.managementRate;

  // Calculate monthly taxes and insurance
  const monthlyTaxes = taxes / 12;
  const monthlyInsurance = insurance / 12;

  // Calculate net operating income (monthly)
  const effectiveGrossIncome = grossMonthlyIncome - vacancyReserveAmount;
  const totalOperatingExpenses = 
    maintenanceReserveAmount + 
    propertyManagementAmount + 
    monthlyTaxes + 
    monthlyInsurance;
  
  const monthlyNoi = effectiveGrossIncome - totalOperatingExpenses;

  // Calculate cash flow (NOI - Debt Service)
  const monthlyCashFlow = monthlyNoi - monthlyPayment;
  const annualCashFlow = monthlyCashFlow * 12;

  // Calculate DSCR (Debt Service Coverage Ratio)
  const annualNoi = monthlyNoi * 12;
  const annualDebtService = monthlyPayment * 12;
  const dscr = annualDebtService > 0 ? annualNoi / annualDebtService : null;

  // Determine if cash flow passes
  const cashFlowPass = monthlyCashFlow > 0;
  const dscrPass = dscr !== null && dscr >= requiredDscr;

  // Build assumptions array
  const assumptionsUsed = [
    `Purchase Price: $${purchasePrice.toLocaleString()}`,
    rehabCost > 0 ? `Rehab Cost: $${rehabCost.toLocaleString()}` : null,
    `Total Acquisition: $${totalAcquisitionCost.toLocaleString()}`,
    `Loan Amount (${(ltv * 100).toFixed(0)}% LTV): $${loanAmount.toLocaleString()}`,
    `Down Payment: $${downPayment.toLocaleString()}`,
    `Interest Rate: ${(effectiveInterestRate * 100).toFixed(2)}% (base ${(config.baseInterestRate * 100).toFixed(2)}% + ${(config.interestRateBuffer * 100).toFixed(2)}% buffer)`,
    `Loan Type: ${loanType}`,
    `Amortization: ${amortization} years`,
    `Monthly Payment: $${monthlyPayment.toFixed(2)}`,
    `Gross Monthly Income: $${grossMonthlyIncome.toFixed(2)}`,
    `Vacancy Reserve (${(config.vacancyRate * 100).toFixed(1)}%): $${vacancyReserveAmount.toFixed(2)}`,
    `Maintenance Reserve (${(config.maintenanceRate * 100).toFixed(1)}%): $${maintenanceReserveAmount.toFixed(2)}`,
    `Property Management (${(config.managementRate * 100).toFixed(1)}%): $${propertyManagementAmount.toFixed(2)}`,
    `Monthly Taxes: $${monthlyTaxes.toFixed(2)}`,
    `Monthly Insurance: $${monthlyInsurance.toFixed(2)}`,
    `Monthly NOI: $${monthlyNoi.toFixed(2)}`,
    `Monthly Cash Flow: $${monthlyCashFlow.toFixed(2)}`,
    `Annual Cash Flow: $${annualCashFlow.toFixed(2)}`,
    `DSCR: ${dscr !== null ? dscr.toFixed(2) : 'N/A'} (Required: ${requiredDscr.toFixed(2)})`
  ].filter(Boolean);

  return {
    monthlyCashFlow: Math.round(monthlyCashFlow * 100) / 100,
    annualCashFlow: Math.round(annualCashFlow * 100) / 100,
    dscr: dscr !== null ? Math.round(dscr * 100) / 100 : null,
    cashFlowPass,
    dscrPass,
    requiredDscr,
    assumptionsUsed,
    breakdown: {
      purchasePrice,
      rehabCost,
      totalAcquisitionCost,
      loanAmount,
      downPayment,
      ltv,
      interestRate: effectiveInterestRate,
      loanType,
      amortization,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      grossMonthlyIncome: Math.round(grossMonthlyIncome * 100) / 100,
      vacancyReserve: Math.round(vacancyReserveAmount * 100) / 100,
      maintenanceReserve: Math.round(maintenanceReserveAmount * 100) / 100,
      propertyManagement: Math.round(propertyManagementAmount * 100) / 100,
      monthlyTaxes: Math.round(monthlyTaxes * 100) / 100,
      monthlyInsurance: Math.round(monthlyInsurance * 100) / 100,
      monthlyNoi: Math.round(monthlyNoi * 100) / 100,
      annualNoi: Math.round(annualNoi * 100) / 100,
      annualDebtService: Math.round(annualDebtService * 100) / 100
    }
  };
}

/**
 * Extract cash flow inputs from a lead
 * @param {Object} lead - Lead document
 * @param {Object} buyBox - BuyBox document (optional, for strategy)
 * @returns {Object} Cash flow inputs
 */
function extractCashFlowInputsFromLead(lead, buyBox = null) {
  // Get purchase price (use asking price or dialer intake asking price)
  const purchasePrice = lead.dialerIntake?.askingPrice || lead.askingPrice || 0;
  
  // Get rehab cost (if available in lead)
  const rehabCost = lead.dialerIntake?.estimatedRehabCost || lead.metadata?.rehabCost || 0;
  
  // Get rent estimate (from lead metadata or dialer intake)
  const estimatedRent = lead.dialerIntake?.estimatedRent || lead.metadata?.estimatedRent || null;
  const noi = lead.dialerIntake?.noi || lead.metadata?.noi || null;
  
  // Get taxes and insurance (from lead metadata or estimates)
  const taxes = lead.metadata?.annualTaxes || lead.dialerIntake?.annualTaxes || 0;
  const insurance = lead.metadata?.annualInsurance || lead.dialerIntake?.annualInsurance || 0;
  
  // Get loan parameters (from buy box or defaults)
  const loanType = buyBox?.cashFlowConfig?.loanType || 'DSCR';
  const ltv = buyBox?.cashFlowConfig?.ltv ?? 0.75;
  const interestRate = buyBox?.cashFlowConfig?.interestRate || null;
  const amortization = buyBox?.cashFlowConfig?.amortization || 30;
  const requiredDscr = buyBox?.cashFlowConfig?.requiredDscr ?? 1.25;
  
  // Get reserves (from buy box config or use defaults)
  const maintenanceReserve = buyBox?.cashFlowConfig?.maintenanceReserve || null;
  const vacancyReserve = buyBox?.cashFlowConfig?.vacancyReserve || null;
  const propertyManagement = buyBox?.cashFlowConfig?.propertyManagement || null;

  return {
    purchasePrice,
    rehabCost,
    estimatedRent,
    noi,
    taxes,
    insurance,
    maintenanceReserve,
    vacancyReserve,
    propertyManagement,
    interestRate,
    loanType,
    ltv,
    amortization,
    requiredDscr
  };
}

module.exports = {
  calculateCashFlow,
  extractCashFlowInputsFromLead
};

