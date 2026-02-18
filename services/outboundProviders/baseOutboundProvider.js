// services/outboundProviders/baseOutboundProvider.js
/**
 * Base class for outbound message providers
 * All providers must implement the send() method
 */

class BaseOutboundProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  /**
   * Send a message
   * @param {Object} params - { to: string, message: string, metadata?: object }
   * @returns {Promise<Object>} { messageId: string, provider: string, status: string }
   * @throws {Error} If send fails
   */
  async send(params) {
    throw new Error('send() must be implemented by provider subclass');
  }

  /**
   * Check if provider is configured and available
   * @returns {boolean}
   */
  isConfigured() {
    return false;
  }

  /**
   * Validate recipient address
   * @param {string} to - Recipient address (phone/email)
   * @returns {boolean}
   */
  validateRecipient(to) {
    return !!to;
  }
}

module.exports = BaseOutboundProvider;

