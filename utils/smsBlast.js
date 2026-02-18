// utils/smsBlast.js
// SMS sending utility with rate limiting, deduplication, and compliance guardrails

const twilio = require('twilio');
const Buyer = require('../models/Buyer');
const BuyerBlastLog = require('../models/BuyerBlastLog');

// Initialize Twilio client (only if credentials are available)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Raw phone number
 * @returns {string|null} Normalized phone (E.164) or null if invalid
 */
function normalizePhone(phone) {
  if (!phone) return null;
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // If 10 digits, assume US number, format as +1XXXXXXXXXX
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  // If 11 digits starting with 1, format as +1XXXXXXXXXX
  if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  // If already has +, return as is (assuming E.164)
  if (phone.startsWith('+')) {
    return phone;
  }
  // Return null if can't normalize
  return null;
}

/**
 * Check if SMS was already sent to buyer for this lead within last 24h
 * @param {string} buyerId - Buyer ID
 * @param {string} leadId - Lead ID
 * @param {string} channel - Channel ('sms' or 'digest')
 * @returns {Promise<boolean>} True if already sent
 */
async function checkDuplicateSend(buyerId, leadId, channel) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const existing = await BuyerBlastLog.findOne({
    leadId,
    buyerIds: buyerId,
    channel,
    createdAt: { $gte: oneDayAgo }
  });
  
  return !!existing;
}

/**
 * Format deal message for SMS (short format)
 * @param {Object} lead - Lead document
 * @returns {string} Formatted message
 */
function formatDealMessage(lead) {
  const city = lead.city || lead.county || 'Location TBD';
  const propertyType = lead.dialerIntake?.propertyType || lead.propertyType || 'Property';
  const beds = lead.dialerIntake?.beds || lead.beds;
  const baths = lead.dialerIntake?.baths || lead.baths;
  const price = lead.dialerIntake?.askingPrice || lead.askingPrice || lead.listPrice;
  
  let headline = `${city} - ${propertyType}`;
  if (beds && baths) {
    headline += ` ${beds}/${baths}`;
  }
  if (price) {
    headline += ` $${price.toLocaleString()}`;
  }
  
  return `${headline}\n\nReply YES for details.\n\nReply STOP to opt out.`;
}

/**
 * Rate limiter: simple throttle (1 msg/sec)
 */
let lastSendTime = 0;
const MIN_SEND_INTERVAL = 1000; // 1 second

async function rateLimit() {
  const now = Date.now();
  const timeSinceLastSend = now - lastSendTime;
  
  if (timeSinceLastSend < MIN_SEND_INTERVAL) {
    const waitTime = MIN_SEND_INTERVAL - timeSinceLastSend;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastSendTime = Date.now();
}

/**
 * Send SMS to a buyer
 * @param {Object} params - { buyerId, leadId, message?, userId }
 * @returns {Promise<Object>} { success: boolean, messageId?: string, error?: string }
 */
async function sendSmsToBuyer(params) {
  const { buyerId, leadId, message, userId } = params;
  
  // Safety: Check Twilio config
  if (!twilioClient || !FROM_NUMBER) {
    return {
      success: false,
      error: 'Twilio not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER'
    };
  }
  
  try {
    // Get buyer
    const buyer = await Buyer.findById(buyerId);
    if (!buyer) {
      return { success: false, error: 'Buyer not found' };
    }
    
    // Check opt-out
    if (buyer.smsOptOut || buyer.optOut?.sms) {
      return { success: false, error: 'Buyer opted out of SMS' };
    }
    
    // Check active
    if (!buyer.active) {
      return { success: false, error: 'Buyer is not active' };
    }
    
    // Get phone (normalize)
    const phone = normalizePhone(buyer.phone || (buyer.phones && buyer.phones[0]));
    if (!phone) {
      return { success: false, error: 'No valid phone number for buyer' };
    }
    
    // Check preferred contact
    if (buyer.preferredContact && buyer.preferredContact !== 'sms' && buyer.preferredContact !== 'both') {
      return { success: false, error: 'Buyer prefers email contact' };
    }
    
    // Check duplicate (within 24h)
    const isDuplicate = await checkDuplicateSend(buyerId, leadId, 'sms');
    if (isDuplicate) {
      return { success: false, error: 'SMS already sent to this buyer for this lead within last 24h' };
    }
    
    // Rate limit
    await rateLimit();
    
    // Format message if not provided
    const smsMessage = message || formatDealMessage(await require('../models/Lead').findById(leadId));
    
    // Send SMS
    const result = await twilioClient.messages.create({
      body: smsMessage,
      from: FROM_NUMBER,
      to: phone
    });
    
    // Update buyer
    buyer.lastSmsSentAt = new Date();
    await buyer.save();
    
    // Log blast
    await BuyerBlastLog.create({
      leadId,
      buyerIds: [buyerId],
      channel: 'sms',
      messagePreview: smsMessage.substring(0, 100),
      sentCount: 1,
      failedCount: 0,
      createdByUserId: userId
    });
    
    return {
      success: true,
      messageId: result.sid,
      phone
    };
  } catch (error) {
    console.error(`[SMS Blast] Error sending to buyer ${buyerId}:`, error.message);
    
    // Log failure
    try {
      await BuyerBlastLog.create({
        leadId,
        buyerIds: [buyerId],
        channel: 'sms',
        messagePreview: message ? message.substring(0, 100) : '',
        sentCount: 0,
        failedCount: 1,
        createdByUserId: userId
      });
    } catch (logError) {
      console.error('[SMS Blast] Failed to log failure:', logError.message);
    }
    
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Send SMS to multiple buyers (with rate limiting and error handling)
 * @param {Object} params - { buyerIds: [], leadId, message?, userId, limit?: number }
 * @returns {Promise<Object>} { sent: number, failed: number, results: [] }
 */
async function sendSmsToBuyers(params) {
  const { buyerIds, leadId, message, userId, limit = 50 } = params;
  
  // Safety: Enforce limit
  const buyersToProcess = buyerIds.slice(0, limit);
  
  const results = {
    sent: 0,
    failed: 0,
    results: []
  };
  
  for (const buyerId of buyersToProcess) {
    const result = await sendSmsToBuyer({ buyerId, leadId, message, userId });
    results.results.push({ buyerId, ...result });
    
    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
    }
  }
  
  return results;
}

module.exports = {
  sendSmsToBuyer,
  sendSmsToBuyers,
  normalizePhone,
  formatDealMessage,
  checkDuplicateSend
};
