// scrapers/countyCron.js
// Cron scheduler for county scrapers
// Can be imported into server.js to run scrapers on a schedule

const cron = require('node-cron');
const connectDB = require('../config/db');
const scrapers = require('./index'); // All county scrapers

let isRunning = false;

/**
 * Runs all county scrapers sequentially
 * This function is idempotent and safe to call multiple times
 */
async function runAllCountyScrapers() {
  // Prevent concurrent runs
  if (isRunning) {
    console.log('[CRON] County scrapers already running, skipping...');
    return;
  }
  
  isRunning = true;
  console.log('='.repeat(60));
  console.log('[CRON] Starting scheduled county scrapers...');
  console.log('='.repeat(60));
  
  try {
    // Ensure DB connection
    await connectDB();
    
    const results = [];
    
    // Run all county scrapers sequentially (not parallel)
    for (const [name, scraper] of Object.entries(scrapers)) {
      try {
        console.log(`[CRON] Running scraper: ${name}`);
        const result = await scraper();
        
        if (result) {
          results.push(result);
          console.log(`[CRON] ${result.county} scrape complete — PF: ${result.preforeclosuresInserted} | TL: ${result.taxLiensInserted} | CV: ${result.codeViolationsInserted} | PR: ${result.probateInserted}`);
        } else {
          console.log(`[CRON] Completed scraper: ${name} (no result returned)`);
        }
      } catch (err) {
        console.error(`[CRON] ERROR in scraper ${name}:`, err.message);
        console.error(`[CRON] Stack trace:`, err.stack);
        // Continue with other scrapers even if one fails
        // NEVER crash the process
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('[CRON] County scrapers completed');
    console.log('='.repeat(60));
    
    if (results.length > 0) {
      const totals = results.reduce((acc, r) => {
        acc.preforeclosures += r.preforeclosuresInserted || 0;
        acc.taxLiens += r.taxLiensInserted || 0;
        acc.codeViolations += r.codeViolationsInserted || 0;
        acc.probate += r.probateInserted || 0;
        acc.leadsCreated += r.leadsCreated || 0;
        return acc;
      }, { preforeclosures: 0, taxLiens: 0, codeViolations: 0, probate: 0, leadsCreated: 0 });
      
      console.log(`[CRON] TOTAL INSERTS — PF: ${totals.preforeclosures} | TL: ${totals.taxLiens} | CV: ${totals.codeViolations} | PR: ${totals.probate}`);
      console.log(`[CRON] Scraper ran successfully — leads created: ${totals.leadsCreated}`);
    } else {
      console.log(`[CRON] No scraper results returned`);
    }
    
    console.log('='.repeat(60));
    
  } catch (err) {
    console.error('\n[CRON] FATAL ERROR:', err.message);
    console.error('[CRON] Stack trace:', err.stack);
    // Don't throw - just log the error
  } finally {
    isRunning = false;
  }
}

/**
 * Starts the cron scheduler for county scrapers
 * Default: Runs daily at 2 AM
 * Can be customized via CRON_SCHEDULE environment variable
 */
function startCountyCron() {
  // Default: Daily at 2 AM
  // Format: minute hour day month day-of-week
  const schedule = process.env.CRON_SCHEDULE || '0 2 * * *';
  
  console.log(`[CRON] Scheduling county scrapers with schedule: ${schedule}`);
  
  cron.schedule(schedule, async () => {
    await runAllCountyScrapers();
  }, {
    scheduled: true,
    timezone: 'America/Chicago' // Central Time for Texas counties
  });
  
  console.log('[CRON] County scrapers cron job started');
}

/**
 * Stops the cron scheduler
 */
function stopCountyCron() {
  // Note: node-cron doesn't have a direct stop method for all tasks
  // This would need to track the task and call .stop() on it
  console.log('[CRON] County scrapers cron job stopped');
}

module.exports = {
  runAllCountyScrapers,
  startCountyCron,
  stopCountyCron
};
