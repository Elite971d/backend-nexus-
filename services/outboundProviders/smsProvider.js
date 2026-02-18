// services/outboundProviders/smsProvider.js
const BaseOutboundProvider = require('./baseOutboundProvider');
const twilio = require('twilio');

/**
 * SMS provider using Twilio
 * Wraps existing Twilio utility
 */
class SMSProvider extends BaseOutboundProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'sms';
    this.client = null;
    
    // Initialize Twilio client if credentials available
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
    
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || config.fromNumber;
  }

  isConfigured() {
    return !!this.client && !!this.fromNumber;
  }

  validateRecipient(to) {
    // Basic phone validation (E.164 format preferred)
    if (!to) return false;
    // Remove non-digit characters for validation
    const digits = to.replace(/\D/g, '');
    return digits.length >= 10;
  }

  /**
   * Send SMS via Twilio
   * @param {Object} params - { to: string (phone), message: string, metadata?: object }
   * @returns {Promise<Object>} { messageId: string, provider: string, status: string }
   */
  async send(params) {
    if (!this.isConfigured()) {
      throw new Error('SMS provider not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER');
    }
    
    const { to, message, metadata = {} } = params;
    
    if (!this.validateRecipient(to)) {
      throw new Error(`Invalid phone number: ${to}`);
    }
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });
      
      return {
        messageId: result.sid,
        provider: 'sms',
        status: result.status || 'sent'
      };
    } catch (error) {
      console.error('[SMS Provider] Error sending SMS:', error.message);
      throw new Error(`SMS send failed: ${error.message}`);
    }
  }
}

module.exports = SMSProvider;

