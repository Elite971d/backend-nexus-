// utils/browser.js
// Playwright browser utilities for headless scraping
// Only used when USE_PLAYWRIGHT=true

const { chromium } = require('playwright');

/**
 * Launches a headless browser instance with realistic defaults
 * @param {Object} options - Browser launch options
 * @param {Boolean} options.headless - Run in headless mode (default: true)
 * @param {String} options.userAgent - Custom user agent (default: realistic desktop)
 * @returns {Promise<Browser>} - Playwright browser instance
 */
async function launchBrowser(options = {}) {
  const {
    headless = true,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  } = options;

  console.log('[PLAYWRIGHT] launch: Starting browser...');

  try {
    const browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    console.log('[PLAYWRIGHT] launch: Browser started successfully');
    return browser;
  } catch (err) {
    console.error('[PLAYWRIGHT] error: Failed to launch browser:', err.message);
    throw err;
  }
}

/**
 * Creates a new page with realistic defaults and timeout handling
 * @param {Browser} browser - Playwright browser instance
 * @param {Object} options - Page options
 * @param {String} options.userAgent - Custom user agent
 * @param {Number} options.timeout - Navigation timeout in ms (default: 30000)
 * @returns {Promise<Page>} - Playwright page instance
 */
async function newPage(browser, options = {}) {
  const {
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    timeout = 30000
  } = options;

  try {
    const page = await browser.newPage();
    
    // Set realistic viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent(userAgent);
    
    // Set default timeout
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    console.log('[PLAYWRIGHT] page loaded: New page created');
    return page;
  } catch (err) {
    console.error('[PLAYWRIGHT] error: Failed to create page:', err.message);
    throw err;
  }
}

/**
 * Retry wrapper for page navigation with error handling
 * @param {Page} page - Playwright page instance
 * @param {String} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @param {Number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {Number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @returns {Promise<Response>} - Navigation response
 */
async function navigateWithRetry(page, url, options = {}) {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[PLAYWRIGHT] Navigating to ${url} (attempt ${attempt}/${maxRetries})`);
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      console.log('[PLAYWRIGHT] page loaded: Navigation successful');
      return response;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error('[PLAYWRIGHT] error: Navigation failed after all retries:', err.message);
        throw err;
      }
      console.log(`[PLAYWRIGHT] Retrying navigation in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * Gracefully closes a browser instance
 * @param {Browser} browser - Playwright browser instance
 */
async function closeBrowser(browser) {
  try {
    if (browser && browser.isConnected()) {
      await browser.close();
      console.log('[PLAYWRIGHT] Browser closed successfully');
    }
  } catch (err) {
    console.error('[PLAYWRIGHT] error: Failed to close browser:', err.message);
  }
}

module.exports = {
  launchBrowser,
  newPage,
  navigateWithRetry,
  closeBrowser
};
