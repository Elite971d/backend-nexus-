// jobs/runCountyScrapers.js
// Independent job entrypoint for running county scrapers
// Usage: node jobs/runCountyScrapers.js

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const connectDB = require('../config/db');
const scrapers = require('../scrapers'); // index.js that exports all county scrapers

async function runCountyScrapers() {
  console.log('='.repeat(60));
  console.log('[JOB] Starting county scrapers...');
  console.log('='.repeat(60));
  
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('[JOB] MongoDB connected successfully');
    
    const results = [];
    
    // Run all county scrapers sequentially (not parallel)
    for (const [name, scraper] of Object.entries(scrapers)) {
      try {
        console.log(`\n[JOB] Running scraper: ${name}`);
        const result = await scraper();
        
        if (result) {
          results.push(result);
          console.log(`[JOB] ${result.county} scrape complete — PF: ${result.preforeclosuresInserted} | TL: ${result.taxLiensInserted} | CV: ${result.codeViolationsInserted} | PR: ${result.probateInserted}`);
        } else {
          console.log(`[JOB] Completed scraper: ${name} (no result returned)`);
        }
      } catch (err) {
        console.error(`[JOB] ERROR in scraper ${name}:`, err.message);
        console.error(`[JOB] Stack trace:`, err.stack);
        // Continue with other scrapers even if one fails
        // NEVER crash the process
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('[JOB] County scrapers completed');
    console.log('='.repeat(60));
    
    if (results.length > 0) {
      const totals = results.reduce((acc, r) => {
        acc.preforeclosures += r.preforeclosuresInserted || 0;
        acc.taxLiens += r.taxLiensInserted || 0;
        acc.codeViolations += r.codeViolationsInserted || 0;
        acc.probate += r.probateInserted || 0;
        return acc;
      }, { preforeclosures: 0, taxLiens: 0, codeViolations: 0, probate: 0 });
      
      console.log(`[JOB] TOTAL INSERTS — PF: ${totals.preforeclosures} | TL: ${totals.taxLiens} | CV: ${totals.codeViolations} | PR: ${totals.probate}`);
    }
    
    console.log('='.repeat(60));
    process.exit(0);
  } catch (err) {
    console.error('\n[JOB] FATAL ERROR:', err.message);
    console.error('[JOB] Stack trace:', err.stack);
    // Exit with error code but don't throw uncaught exception
    process.exit(1);
  }
}

// Run the job
runCountyScrapers();

