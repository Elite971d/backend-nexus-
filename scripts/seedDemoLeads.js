// scripts/seedDemoLeads.js
// Seeds 5 realistic demo leads if no leads exist
// Production-safe: only runs if Lead collection is empty

const Lead = require('../models/Lead');
const { upsertLeadFromSource } = require('../utils/leadUpsert');
const { recalculateAndSaveLeadScore } = require('../utils/leadScoringEngine');

async function seedDemoLeads() {
  try {
    // Check if any leads exist
    const existingLeads = await Lead.countDocuments();
    if (existingLeads > 0) {
      console.log(`[SEED] ${existingLeads} leads already exist, skipping demo lead seed`);
      return;
    }
    
    console.log('[SEED] No leads found, seeding 5 demo leads...');
    
    const demoLeads = [
      {
        source: 'preforeclosure',
        category: 'Pre-Foreclosure',
        ownerName: 'Smith, John A',
        propertyAddress: '1234 Elm Street, Dallas, TX 75201',
        mailingAddress: '1234 Elm Street, Dallas, TX 75201',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        county: 'Dallas County',
        delinquentAmount: 45230,
        status: 'new',
        tags: ['preforeclosure', 'dallas_county'],
        createdFrom: 'scraper'
      },
      {
        source: 'probate',
        category: 'Probate',
        ownerName: 'Anderson, Sarah K',
        propertyAddress: '5678 Ash Court, Dallas, TX 75210',
        mailingAddress: '5678 Ash Court, Dallas, TX 75210',
        city: 'Dallas',
        state: 'TX',
        zip: '75210',
        county: 'Dallas County',
        caseNumber: 'PR-2024-000567',
        description: 'Probate Estate - Executor: Anderson, Sarah K, Attorney: Law Firm of Smith & Associates',
        status: 'new',
        tags: ['probate', 'dallas_county'],
        createdFrom: 'scraper'
      },
      {
        source: 'tax_lien',
        category: 'Tax Lien',
        ownerName: 'Brown, Patricia M',
        propertyAddress: '3456 Pine Street, Dallas, TX 75204',
        mailingAddress: '3456 Pine Street, Dallas, TX 75204',
        city: 'Dallas',
        state: 'TX',
        zip: '75204',
        county: 'Dallas County',
        delinquentAmount: 12450,
        status: 'new',
        tags: ['tax_lien', 'dallas_county'],
        createdFrom: 'scraper'
      },
      {
        source: 'code_violation',
        category: 'Code Violation',
        ownerName: 'Wilson, David T',
        propertyAddress: '4567 Spruce Avenue, Dallas, TX 75207',
        mailingAddress: '4567 Spruce Avenue, Dallas, TX 75207',
        city: 'Dallas',
        state: 'TX',
        zip: '75207',
        county: 'Dallas County',
        caseNumber: 'CV-2024-001234',
        description: 'Code Violation: Overgrown Vegetation',
        status: 'new',
        tags: ['code_violation', 'dallas_county'],
        createdFrom: 'scraper'
      },
      {
        source: 'preforeclosure',
        category: 'Pre-Foreclosure',
        ownerName: 'Martinez, Carlos E',
        propertyAddress: '1234 Main Street, Plano, TX 75023',
        mailingAddress: '1234 Main Street, Plano, TX 75023',
        city: 'Plano',
        state: 'TX',
        zip: '75023',
        county: 'Collin County',
        delinquentAmount: 38500,
        status: 'new',
        tags: ['preforeclosure', 'collin_county'],
        createdFrom: 'scraper'
      }
    ];
    
    let leadsCreated = 0;
    for (const leadData of demoLeads) {
      try {
        const { lead, isNew } = await upsertLeadFromSource('county_scraper', leadData);
        if (isNew) {
          leadsCreated++;
          // Auto-score the lead
          try {
            await recalculateAndSaveLeadScore(lead);
          } catch (scoreErr) {
            console.error(`[SEED] Failed to score demo lead ${lead._id}:`, scoreErr.message);
          }
        }
      } catch (err) {
        console.error(`[SEED] Failed to create demo lead:`, err.message);
      }
    }
    
    console.log(`[SEED] Successfully seeded ${leadsCreated} demo leads`);
    return leadsCreated;
  } catch (err) {
    console.error('[SEED] Error seeding demo leads:', err);
    throw err;
  }
}

module.exports = seedDemoLeads;

// If run directly
if (require.main === module) {
  const connectDB = require('../config/db');
  connectDB()
    .then(() => seedDemoLeads())
    .then(() => {
      console.log('[SEED] Demo lead seeding complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('[SEED] Fatal error:', err);
      process.exit(1);
    });
}

