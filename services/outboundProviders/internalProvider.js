// services/outboundProviders/internalProvider.js
const BaseOutboundProvider = require('./baseOutboundProvider');
const DealBlastRecipient = require('../../models/DealBlastRecipient');

/**
 * Internal provider - stores notifications in database
 * Used for in-app notifications and when SMS/email providers are not configured
 */
class InternalProvider extends BaseOutboundProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'internal';
  }

  isConfigured() {
    return true; // Always available
  }

  /**
   * Send internal notification (stores in DealBlastRecipient)
   * @param {Object} params - { to: string (buyerId), message: string, dealBlastRecipientId: string, metadata?: object }
   * @returns {Promise<Object>} { messageId: string, provider: string, status: string }
   */
  async send(params) {
    const { to, message, dealBlastRecipientId, metadata = {} } = params;
    
    if (!dealBlastRecipientId) {
      throw new Error('dealBlastRecipientId is required for internal provider');
    }
    
    // Update recipient record
    const recipient = await DealBlastRecipient.findById(dealBlastRecipientId);
    if (!recipient) {
      throw new Error(`DealBlastRecipient ${dealBlastRecipientId} not found`);
    }
    
    // Store message in recipient record (could also create a Notification model)
    recipient.status = 'sent';
    recipient.sentAt = new Date();
    recipient.tracking = {
      messageId: `internal_${recipient._id}_${Date.now()}`,
      provider: 'internal'
    };
    
    // Store message content in metadata (for internal notifications)
    if (!recipient.metadata) {
      recipient.metadata = {};
    }
    recipient.metadata.message = message;
    recipient.metadata.sentAt = new Date();
    
    await recipient.save();
    
    return {
      messageId: recipient.tracking.messageId,
      provider: 'internal',
      status: 'sent'
    };
  }
}

module.exports = InternalProvider;

