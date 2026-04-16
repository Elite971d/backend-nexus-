/**
 * Placeholder for Google Maps Geocoding (or similar) enrichment.
 * Wire an API key and HTTP client here when ready; do not block intake on failure.
 *
 * @param {string} address
 * @returns {Promise<{ lat: number | null, lng: number | null }>}
 */
async function enrichCoordinates(address) {
  void address;
  return { lat: null, lng: null };
}

module.exports = { enrichCoordinates };
