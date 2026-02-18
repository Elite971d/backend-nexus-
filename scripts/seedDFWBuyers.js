// scripts/seedDFWBuyers.js
// Seed DFW sample buyers matching Quick Flip Buy Box and Buy & Hold criteria
// Only seeds if Buyer collection is empty

const Buyer = require('../models/Buyer');
const connectDB = require('../config/db');

/**
 * Seed DFW sample buyers
 * Only runs if Buyer collection is empty
 */
async function seedDFWBuyers() {
  try {
    await connectDB();

    // Check if any buyers exist
    const buyerCount = await Buyer.countDocuments();
    
    if (buyerCount > 0) {
      console.log(`ℹ️  ${buyerCount} buyers already exist — skipping seed`);
      return;
    }

    console.log('🌱 Seeding DFW sample buyers...');

    const buyers = [
      // Quick Flip Buyers (Fix & Flip)
      {
        name: 'DFW Quick Flip LLC',
        email: 'flip@dfwquickflip.com',
        phone: '214-555-0101',
        buyerType: 'fix_and_flip',
        counties: ['Dallas', 'Collin', 'Tarrant', 'Denton'],
        states: ['TX'],
        propertyTypes: ['SFR', 'MF'],
        minPrice: 50000,
        maxPrice: 250000,
        minBeds: 2,
        minBaths: 1,
        minSqft: 800,
        yearBuiltMin: 1950,
        conditionTolerance: 'medium',
        dealTypes: ['cash'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 14,
        notes: 'DFW Quick Flip - Fast closing, cash ready',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['flip']
      },
      {
        name: 'Metroplex Flip Partners',
        email: 'deals@metroplexflip.com',
        phone: '972-555-0202',
        buyerType: 'fix_and_flip',
        counties: ['Dallas', 'Collin'],
        states: ['TX'],
        propertyTypes: ['SFR'],
        minPrice: 75000,
        maxPrice: 300000,
        minBeds: 3,
        minBaths: 2,
        minSqft: 1200,
        yearBuiltMin: 1980,
        conditionTolerance: 'light',
        dealTypes: ['cash'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 21,
        notes: 'Light rehab only, prefer newer homes',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['flip']
      },
      {
        name: 'Heavy Rehab Specialists',
        email: 'heavy@rehabdfw.com',
        phone: '469-555-0303',
        buyerType: 'fix_and_flip',
        counties: ['Dallas', 'Tarrant', 'Denton'],
        states: ['TX'],
        propertyTypes: ['SFR', 'MF'],
        minPrice: 30000,
        maxPrice: 150000,
        minBeds: 2,
        minBaths: 1,
        minSqft: 600,
        yearBuiltMin: 1940,
        conditionTolerance: 'heavy',
        dealTypes: ['cash'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 30,
        notes: 'Specializes in heavy rehab, distressed properties',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['flip']
      },
      // Buy & Hold Cash Flow Buyers
      {
        name: 'DFW Rental Investors',
        email: 'invest@dfwrentals.com',
        phone: '214-555-0404',
        buyerType: 'buy_and_hold',
        counties: ['Dallas', 'Collin', 'Tarrant', 'Denton'],
        states: ['TX'],
        propertyTypes: ['SFR', 'MF'],
        minPrice: 60000,
        maxPrice: 200000,
        minBeds: 2,
        minBaths: 1,
        minSqft: 900,
        yearBuiltMin: 1970,
        conditionTolerance: 'medium',
        dealTypes: ['cash', 'seller_finance'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 21,
        notes: 'Buy and hold for rental income, prefers cash flow positive',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['rental']
      },
      {
        name: 'Cash Flow Capital LLC',
        email: 'deals@cashflowcapital.com',
        phone: '972-555-0505',
        buyerType: 'buy_and_hold',
        counties: ['Dallas', 'Collin'],
        states: ['TX'],
        propertyTypes: ['SFR', 'MF'],
        minPrice: 80000,
        maxPrice: 250000,
        minBeds: 3,
        minBaths: 2,
        minSqft: 1200,
        yearBuiltMin: 1985,
        conditionTolerance: 'light',
        dealTypes: ['cash', 'subto', 'seller_finance'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 30,
        notes: 'Focus on cash flow positive properties, open to creative financing',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['rental']
      },
      // Commercial Buyers
      {
        name: 'DFW Commercial Acquisitions',
        email: 'commercial@dfwacq.com',
        phone: '214-555-0606',
        buyerType: 'commercial',
        counties: ['Dallas', 'Tarrant'],
        states: ['TX'],
        propertyTypes: ['COMMERCIAL'],
        minPrice: 150000,
        maxPrice: 500000,
        minSqft: 2000,
        yearBuiltMin: 1980,
        conditionTolerance: 'medium',
        dealTypes: ['cash', 'commercial'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 45,
        notes: 'Commercial properties only, retail/office/warehouse',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['commercial']
      },
      // Multi-Strategy Buyers
      {
        name: 'Flexible DFW Investors',
        email: 'info@flexibledfw.com',
        phone: '469-555-0707',
        buyerType: 'fix_and_flip',
        counties: ['Dallas', 'Collin', 'Tarrant', 'Denton'],
        states: ['TX'],
        propertyTypes: ['SFR', 'MF'],
        minPrice: 50000,
        maxPrice: 300000,
        minBeds: 2,
        minBaths: 1,
        minSqft: 800,
        yearBuiltMin: 1960,
        conditionTolerance: 'medium',
        dealTypes: ['cash', 'novation', 'subto'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 21,
        notes: 'Flexible on deal structure, quick to close',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['flip', 'rental']
      },
      {
        name: 'All Counties DFW',
        email: 'deals@alldfw.com',
        phone: '214-555-0808',
        buyerType: 'fix_and_flip',
        counties: ['Dallas', 'Collin', 'Tarrant', 'Denton', 'Ellis', 'Kaufman', 'Rockwall'],
        states: ['TX'],
        propertyTypes: ['SFR', 'MF'],
        minPrice: 40000,
        maxPrice: 200000,
        minBeds: 2,
        minBaths: 1,
        minSqft: 700,
        yearBuiltMin: 1950,
        conditionTolerance: 'medium',
        dealTypes: ['cash'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 18,
        notes: 'Covers all DFW counties, fast closing',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['flip']
      },
      {
        name: 'Budget Buyers DFW',
        email: 'budget@dfwbuys.com',
        phone: '972-555-0909',
        buyerType: 'fix_and_flip',
        counties: ['Dallas', 'Tarrant'],
        states: ['TX'],
        propertyTypes: ['SFR'],
        minPrice: 25000,
        maxPrice: 100000,
        minBeds: 2,
        minBaths: 1,
        minSqft: 600,
        yearBuiltMin: 1940,
        conditionTolerance: 'heavy',
        dealTypes: ['cash'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 14,
        notes: 'Budget properties, heavy rehab OK',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['flip']
      },
      {
        name: 'Premium DFW Properties',
        email: 'premium@dfwprops.com',
        phone: '214-555-1010',
        buyerType: 'fix_and_flip',
        counties: ['Collin', 'Dallas'],
        states: ['TX'],
        propertyTypes: ['SFR'],
        minPrice: 150000,
        maxPrice: 400000,
        minBeds: 3,
        minBaths: 2,
        minSqft: 1500,
        yearBuiltMin: 1990,
        conditionTolerance: 'light',
        dealTypes: ['cash'],
        cashReady: true,
        proofOfFunds: true,
        avgCloseDays: 21,
        notes: 'Premium properties, light rehab only',
        active: true,
        source: 'manual',
        markets: ['TX-DFW'],
        preferredMarkets: ['TX-DFW'],
        strategies: ['flip']
      }
    ];

    // Create buyers
    const createdBuyers = await Buyer.insertMany(buyers);

    console.log(`✅ Seeded ${createdBuyers.length} DFW buyers:`);
    createdBuyers.forEach(buyer => {
      console.log(`   - ${buyer.name} (${buyer.buyerType})`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding DFW buyers:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedDFWBuyers();
}

module.exports = seedDFWBuyers;

