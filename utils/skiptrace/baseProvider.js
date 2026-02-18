// utils/skiptrace/baseProvider.js
/**
 * Base interface for skip trace providers
 * All providers must implement the skipTrace method
 */

class BaseProvider {
  /**
   * Performs skip trace lookup for a lead
   * @param {Object} lead - Lead document with ownerName, propertyAddress, mailingAddress, etc.
   * @returns {Promise<Object>} Contact enrichment result
   * 
   * Expected return format:
   * {
   *   phones: [{ number: string, type?: string, confidence?: number }],
   *   emails: [{ email: string, confidence?: number }],
   *   mailingAddress?: string,
   *   ownerType?: "individual" | "entity",
   *   source: string,
   *   confidenceScore?: number
   * }
   */
  async skipTrace(lead) {
    throw new Error('skipTrace must be implemented by provider');
  }

  /**
   * Returns whether this provider is enabled/available
   * @returns {boolean}
   */
  isEnabled() {
    return true;
  }

  /**
   * Returns provider name for logging
   * @returns {string}
   */
  getName() {
    return this.constructor.name;
  }
}

module.exports = BaseProvider;

