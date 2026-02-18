// utils/proxypool.js
// Proxy pool utility (stub - to be implemented)
// TODO: Implement proxy rotation for scrapers if needed

/**
 * Gets a proxy from the pool
 * @returns {String|null} - Proxy URL or null if no proxy available
 */
function getProxy() {
  // TODO: Implement proxy pool logic
  // For now, return null (no proxy)
  return null;
}

/**
 * Marks a proxy as failed
 * @param {String} proxy - Proxy URL
 */
function markProxyFailed(proxy) {
  // TODO: Implement proxy failure tracking
}

module.exports = {
  getProxy,
  markProxyFailed
};
