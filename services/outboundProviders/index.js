// services/outboundProviders/index.js
/**
 * Provider factory - returns appropriate provider based on channel
 */
const InternalProvider = require('./internalProvider');
const SMSProvider = require('./smsProvider');
const EmailProvider = require('./emailProvider');

const providers = {
  internal: new InternalProvider(),
  sms: new SMSProvider(),
  email: new EmailProvider()
};

/**
 * Get provider for channel
 * @param {string} channel - 'internal' | 'sms' | 'email'
 * @returns {BaseOutboundProvider} Provider instance
 */
function getProvider(channel) {
  const provider = providers[channel];
  if (!provider) {
    throw new Error(`Unknown provider channel: ${channel}`);
  }
  return provider;
}

/**
 * Get available providers (configured and ready)
 * @returns {Object} { internal: boolean, sms: boolean, email: boolean }
 */
function getAvailableProviders() {
  return {
    internal: providers.internal.isConfigured(),
    sms: providers.sms.isConfigured(),
    email: providers.email.isConfigured()
  };
}

module.exports = {
  getProvider,
  getAvailableProviders,
  InternalProvider,
  SMSProvider,
  EmailProvider
};

