// utils/marketUtils.js
/**
 * Market utility functions for handling markets across all 50 states
 * Market format: STATE-NAME (e.g., TX-DFW, TX-HOUSTON, CA-LA)
 */

/**
 * Validates market code format
 * @param {string} market - Market code (e.g., "TX-DFW")
 * @returns {boolean}
 */
function isValidMarket(market) {
  if (!market || typeof market !== 'string') return false;
  // Format: STATE-NAME (2 letter state code, dash, market name)
  const pattern = /^[A-Z]{2}-[A-Z0-9]+$/i;
  return pattern.test(market);
}

/**
 * Extracts state code from market
 * @param {string} market - Market code (e.g., "TX-DFW")
 * @returns {string|null} State code (e.g., "TX")
 */
function getStateFromMarket(market) {
  if (!isValidMarket(market)) return null;
  return market.split('-')[0].toUpperCase();
}

/**
 * Extracts market name from market code
 * @param {string} market - Market code (e.g., "TX-DFW")
 * @returns {string|null} Market name (e.g., "DFW")
 */
function getMarketName(market) {
  if (!isValidMarket(market)) return null;
  return market.split('-')[1].toUpperCase();
}

/**
 * Gets default markets from env or returns defaults
 * @returns {Array<string>} Array of market codes
 */
function getDefaultMarkets() {
  const envMarkets = process.env.DEFAULT_MARKETS;
  if (envMarkets) {
    return envMarkets.split(',').map(m => m.trim()).filter(isValidMarket);
  }
  // Default markets
  return ['TX-DFW', 'TX-HOUSTON'];
}

/**
 * Normalizes market code (uppercase, validates)
 * @param {string} market - Market code
 * @returns {string|null} Normalized market or null if invalid
 */
function normalizeMarket(market) {
  if (!market) return null;
  const normalized = market.trim().toUpperCase();
  return isValidMarket(normalized) ? normalized : null;
}

/**
 * Validates array of markets
 * @param {Array<string>} markets - Array of market codes
 * @returns {Array<string>} Validated and normalized markets
 */
function validateMarkets(markets) {
  if (!Array.isArray(markets)) return [];
  return markets
    .map(normalizeMarket)
    .filter(m => m !== null);
}

/**
 * Gets all markets for a state
 * @param {string} stateCode - Two-letter state code (e.g., "TX")
 * @param {Array<string>} allMarkets - Array of all market codes to search
 * @returns {Array<string>} Markets in that state
 */
function getMarketsByState(stateCode, allMarkets) {
  if (!stateCode || !Array.isArray(allMarkets)) return [];
  const upperState = stateCode.toUpperCase();
  return allMarkets.filter(m => getStateFromMarket(m) === upperState);
}

/**
 * US State codes (all 50 states)
 */
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

/**
 * Checks if state code is valid
 * @param {string} stateCode - Two-letter state code
 * @returns {boolean}
 */
function isValidStateCode(stateCode) {
  if (!stateCode) return false;
  return US_STATES.includes(stateCode.toUpperCase());
}

module.exports = {
  isValidMarket,
  getStateFromMarket,
  getMarketName,
  getDefaultMarkets,
  normalizeMarket,
  validateMarkets,
  getMarketsByState,
  isValidStateCode,
  US_STATES
};

