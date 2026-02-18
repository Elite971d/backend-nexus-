// jobs/runEmailScraper.js
// Independent job entrypoint for running email scraper
// Usage: node jobs/runEmailScraper.js

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const connectDB = require('../config/db');
const { scrapeWholesaleEmails } = require('../scrapers/emailDeals');

async function runEmailScraper() {
  console.log('[JOB] start: Email scraper');
  
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Run email scraper
    await scrapeWholesaleEmails();
    
    console.log('[JOB] success: Email scraper completed');
    process.exit(0);
  } catch (err) {
    console.error('[JOB] error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

// Run the job
runEmailScraper();

