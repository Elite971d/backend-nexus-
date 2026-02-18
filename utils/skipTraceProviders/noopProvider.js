// utils/skipTraceProviders/noopProvider.js
/**
 * No-op provider for development/testing
 * Returns empty or mock data safely without making external API calls
 */
const BaseProvider = require('./baseProvider');

class NoopProvider extends BaseProvider {
  /**
   * Returns empty skip trace result (development mode)
   */
  async skipTraceLead(lead) {
    // Return normalized empty result structure
    return {
      phones: [],
      emails: [],
      mailingAddresses: [],
      entityInfo: {
        isLLC: null,
        entityName: null,
        registeredState: null
      },
      confidenceScore: 0
    };
  }

  /**
   * Returns zero cost for no-op provider
   */
  async estimateCost(lead) {
    return 0;
  }
}

module.exports = NoopProvider;

