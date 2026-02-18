// utils/skiptrace/noopProvider.js
/**
 * No-op provider - returns empty contact info
 * Used as fallback when no other providers return data
 */
const BaseProvider = require('./baseProvider');

class NoopProvider extends BaseProvider {
  /**
   * Returns empty contact info (fallback)
   */
  async skipTrace(lead) {
    return {
      phones: [],
      emails: [],
      source: 'noop',
      confidenceScore: 0
    };
  }

  getName() {
    return 'noop';
  }
}

module.exports = NoopProvider;

