// scripts/seedDevData.js
// Seeds dev fallback data if collections are empty
// ONLY runs if NODE_ENV !== "production"

if (process.env.NODE_ENV === 'production') {
  console.log('[SEED] Skipping dev data seed - production environment');
  process.exit(0);
}

require('dotenv').config();
const connectDB = require('../config/db');
const PreForeclosure = require('../models/PreForeclosure');
const TaxLien = require('../models/TaxLien');
const CodeViolation = require('../models/CodeViolation');
const Probate = require('../models/Probate');

async function seedDevData() {
  try {
    await connectDB();
    console.log('[SEED] Connected to MongoDB');
    
    // Check if collections are empty
    const preforeclosureCount = await PreForeclosure.countDocuments();
    const taxLienCount = await TaxLien.countDocuments();
    const codeViolationCount = await CodeViolation.countDocuments();
    const probateCount = await Probate.countDocuments();
    
    console.log(`[SEED] Current counts - PF: ${preforeclosureCount} | TL: ${taxLienCount} | CV: ${codeViolationCount} | PR: ${probateCount}`);
    
    // Seed PreForeclosures if empty
    if (preforeclosureCount === 0) {
      console.log('[SEED] Seeding preforeclosures...');
      await PreForeclosure.insertMany([
        {
          ownerName: 'Demo Owner 1',
          propertyAddress: '123 Demo Street, Dallas, TX 75201',
          mailingAddress: '123 Demo Street, Dallas, TX 75201',
          amountDelinquent: '$35,000.00',
          auctionDate: '2024-04-15',
          county: 'Dallas County',
          source: 'County Clerk',
          trigger: 'Pre-Foreclosure'
        },
        {
          ownerName: 'Demo Owner 2',
          propertyAddress: '456 Sample Avenue, Plano, TX 75023',
          mailingAddress: 'PO Box 123, Plano, TX 75023',
          amountDelinquent: '$42,500.00',
          auctionDate: '2024-04-22',
          county: 'Collin County',
          source: 'County Clerk',
          trigger: 'Pre-Foreclosure'
        },
        {
          ownerName: 'Demo Owner 3',
          propertyAddress: '789 Test Drive, Fort Worth, TX 76107',
          mailingAddress: '789 Test Drive, Fort Worth, TX 76107',
          amountDelinquent: '$38,200.00',
          auctionDate: '2024-04-29',
          county: 'Tarrant County',
          source: 'County Clerk',
          trigger: 'Pre-Foreclosure'
        }
      ]);
      console.log('[SEED] Inserted 3 preforeclosure records');
    }
    
    // Seed Tax Liens if empty
    if (taxLienCount === 0) {
      console.log('[SEED] Seeding tax liens...');
      await TaxLien.insertMany([
        {
          ownerName: 'Demo Taxpayer 1',
          propertyAddress: '321 Example Road, Dallas, TX 75202',
          delinquentAmount: '$12,000.00',
          yearsOwed: '2',
          propertyValue: '$200,000',
          county: 'Dallas County',
          source: 'County Tax Office',
          trigger: 'Tax Lien'
        },
        {
          ownerName: 'Demo Taxpayer 2',
          propertyAddress: '654 Sample Lane, Frisco, TX 75034',
          delinquentAmount: '$8,500.00',
          yearsOwed: '1',
          propertyValue: '$250,000',
          county: 'Collin County',
          source: 'County Tax Office',
          trigger: 'Tax Lien'
        },
        {
          ownerName: 'Demo Taxpayer 3',
          propertyAddress: '987 Test Boulevard, Arlington, TX 76010',
          delinquentAmount: '$15,300.00',
          yearsOwed: '3',
          propertyValue: '$180,000',
          county: 'Tarrant County',
          source: 'County Tax Office',
          trigger: 'Tax Lien'
        }
      ]);
      console.log('[SEED] Inserted 3 tax lien records');
    }
    
    // Seed Code Violations if empty
    if (codeViolationCount === 0) {
      console.log('[SEED] Seeding code violations...');
      await CodeViolation.insertMany([
        {
          caseNumber: 'CV-DEMO-001',
          propertyAddress: '111 Violation Street, Dallas, TX 75203',
          violationType: 'Overgrown Vegetation',
          ownerName: 'Demo Violator 1',
          status: 'Open',
          county: 'Dallas County',
          source: 'City Code Database',
          trigger: 'Code Violation'
        },
        {
          caseNumber: 'CV-DEMO-002',
          propertyAddress: '222 Problem Avenue, Plano, TX 75024',
          violationType: 'Unsafe Structure',
          ownerName: 'Demo Violator 2',
          status: 'Open',
          county: 'Collin County',
          source: 'City Code Database',
          trigger: 'Code Violation'
        },
        {
          caseNumber: 'CV-DEMO-003',
          propertyAddress: '333 Issue Drive, Fort Worth, TX 76108',
          violationType: 'Junk Vehicle',
          ownerName: 'Demo Violator 3',
          status: 'Pending',
          county: 'Tarrant County',
          source: 'City Code Database',
          trigger: 'Code Violation'
        }
      ]);
      console.log('[SEED] Inserted 3 code violation records');
    }
    
    // Seed Probate if empty
    if (probateCount === 0) {
      console.log('[SEED] Seeding probate records...');
      await Probate.insertMany([
        {
          caseNumber: 'PR-DEMO-001',
          executorName: 'Demo Executor 1',
          attorneyName: 'Demo Law Firm',
          estateAddress: '555 Estate Court, Dallas, TX 75204',
          county: 'Dallas County',
          source: 'County Probate Court',
          trigger: 'Probate'
        },
        {
          caseNumber: 'PR-DEMO-002',
          executorName: 'Demo Executor 2',
          attorneyName: 'Sample Legal Group',
          estateAddress: '666 Will Way, McKinney, TX 75069',
          county: 'Collin County',
          source: 'County Probate Court',
          trigger: 'Probate'
        },
        {
          caseNumber: 'PR-DEMO-003',
          executorName: 'Demo Executor 3',
          attorneyName: 'Test Attorneys LLC',
          estateAddress: '777 Trust Street, Arlington, TX 76011',
          county: 'Tarrant County',
          source: 'County Probate Court',
          trigger: 'Probate'
        }
      ]);
      console.log('[SEED] Inserted 3 probate records');
    }
    
    console.log('[SEED] Dev data seeding complete');
    
    // Only exit if called directly (not when imported)
    if (require.main === module) {
      process.exit(0);
    }
  } catch (err) {
    console.error('[SEED] Error seeding dev data:', err.message);
    console.error(err);
    
    // Only exit if called directly (not when imported)
    if (require.main === module) {
      process.exit(1);
    }
    // Re-throw if imported so caller can handle
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  seedDevData();
}

module.exports = seedDevData;
