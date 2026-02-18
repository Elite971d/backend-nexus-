// scrapers/exampleCounty.js
// Example county scraper demonstrating conditional Playwright usage
// This scraper works with or without Playwright based on USE_PLAYWRIGHT env flag

const { upsertLeadFromSource } = require('../utils/leadUpsert');
const { launchBrowser, newPage, navigateWithRetry, closeBrowser } = require('../utils/browser');

const USE_PLAYWRIGHT = process.env.USE_PLAYWRIGHT === 'true';

/**
 * Scrapes county records using either Playwright (if enabled) or traditional fetch
 * This is an example scraper - replace with actual county scraping logic
 */
async function scrapeExampleCounty() {
  console.log(`[SCRAPER] exampleCounty: Starting (Playwright: ${USE_PLAYWRIGHT ? 'enabled' : 'disabled'})`);

  if (USE_PLAYWRIGHT) {
    return await scrapeWithPlaywright();
  } else {
    return await scrapeWithFetch();
  }
}

/**
 * Traditional scraping using fetch (existing approach)
 */
async function scrapeWithFetch() {
  try {
    // Example: Traditional fetch-based scraping
    // Replace with actual county website URL and parsing logic
    const url = 'https://example-county-records.com/probate';
    
    console.log('[SCRAPER] exampleCounty: Using fetch method');
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    
    // Example: Parse HTML using regex or simple string methods
    // In production, you might use cheerio or similar
    // For now, this is a placeholder that demonstrates the pattern
    
    // Example lead data structure
    const exampleLeads = [
      {
        source: 'probate',
        category: 'Probate',
        county: 'Example County',
        ownerName: 'John Doe',
        propertyAddress: '123 Main St',
        city: 'Example City',
        state: 'CA',
        zip: '12345',
        caseNumber: 'PROB-2024-001'
      }
    ];

    // Upsert leads
    for (const leadData of exampleLeads) {
      await upsertLeadFromSource('county_scraper', leadData);
    }

    console.log('[SCRAPER] exampleCounty: Completed (fetch method)');
    return { success: true, count: exampleLeads.length };
  } catch (err) {
    console.error('[SCRAPER] exampleCounty: Error in fetch method:', err.message);
    throw err;
  }
}

/**
 * Playwright-based scraping for JS-heavy sites
 */
async function scrapeWithPlaywright() {
  let browser = null;
  
  try {
    console.log('[SCRAPER] exampleCounty: Using Playwright method');
    
    // Launch browser
    browser = await launchBrowser({ headless: true });
    
    // Create new page
    const page = await newPage(browser);
    
    // Navigate to target URL
    // Replace with actual county website URL
    const url = 'https://example-county-records.com/probate';
    await navigateWithRetry(page, url);
    
    // Wait for content to load (adjust selector based on actual site)
    console.log('[PLAYWRIGHT] Waiting for page content...');
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Extract data using page.evaluate()
    console.log('[PLAYWRIGHT] Extracting data from page...');
    const extractedData = await page.evaluate(() => {
      // This runs in the browser context
      // Replace with actual DOM extraction logic
      
      // Example: Extract probate records from a table or list
      const records = [];
      
      // Example selector - adjust based on actual site structure
      const rows = document.querySelectorAll('table.probate-records tr, .probate-list-item');
      
      rows.forEach((row, index) => {
        // Example extraction - replace with actual selectors
        const ownerName = row.querySelector('.owner-name')?.textContent?.trim() || `Owner ${index + 1}`;
        const address = row.querySelector('.address')?.textContent?.trim() || '123 Main St';
        const caseNumber = row.querySelector('.case-number')?.textContent?.trim() || `CASE-${index + 1}`;
        
        records.push({
          ownerName,
          propertyAddress: address,
          caseNumber
        });
      });
      
      // If no records found, return example data
      if (records.length === 0) {
        return [{
          ownerName: 'John Doe',
          propertyAddress: '123 Main St',
          caseNumber: 'PROB-2024-001'
        }];
      }
      
      return records;
    });
    
    console.log(`[PLAYWRIGHT] extract success: Found ${extractedData.length} records`);
    
    // Process and upsert leads
    const leads = [];
    for (const record of extractedData) {
      const leadData = {
        source: 'probate',
        category: 'Probate',
        county: 'Example County',
        ownerName: record.ownerName,
        propertyAddress: record.propertyAddress,
        city: 'Example City',
        state: 'CA',
        zip: '12345',
        caseNumber: record.caseNumber
      };
      
      await upsertLeadFromSource('county_scraper', leadData);
      leads.push(leadData);
    }
    
    console.log('[SCRAPER] exampleCounty: Completed (Playwright method)');
    return { success: true, count: leads.length };
  } catch (err) {
    console.error('[PLAYWRIGHT] error:', err.message);
    console.error('[SCRAPER] exampleCounty: Error in Playwright method:', err.message);
    throw err;
  } finally {
    // Always close browser, even on error
    if (browser) {
      await closeBrowser(browser);
    }
  }
}

module.exports = scrapeExampleCounty;
