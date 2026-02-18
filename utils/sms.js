// utils/sms.js
// Safe SMS alerting for new leads (no spam)

const twilio = require('twilio');
const Lead = require('../models/Lead');

// Initialize Twilio client (only if credentials are available)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

/**
 * Sends SMS alert for a new lead
 * Only sends if:
 * - isNew === true (lead was just created, not updated)
 * - lead.alertedAt is empty/null
 * 
 * After successful send, sets lead.alertedAt and saves the lead.
 * SMS failures are caught and logged, but do not throw errors.
 * 
 * @param {Object} lead - Lead document
 * @param {Boolean} isNew - Whether this is a new lead (from upsertLeadFromSource)
 */
async function sendNewDealAlert(lead, isNew = false) {
  // Safety check: Only send for new leads
  if (!isNew) {
    return;
  }
  
  // Safety check: Only send if not already alerted
  if (lead.alertedAt) {
    return;
  }
  
  // Check if Twilio is configured
  if (!twilioClient) {
    console.log('[SMS] Twilio not configured, skipping alert');
    return;
  }
  
  const alertPhone = process.env.ALERT_PHONE_NUMBER;
  if (!alertPhone) {
    console.log('[SMS] ALERT_PHONE_NUMBER not configured, skipping alert');
    return;
  }
  
  try {
    // Build alert message
    const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';
    const owner = lead.ownerName || 'Unknown owner';
    const category = lead.category || lead.source || 'Lead';
    const price = lead.askingPrice || lead.listPrice;
    const priceStr = price ? `$${price.toLocaleString()}` : 'Price TBD';
    
    const message = `🏠 New ${category}: ${owner}\n📍 ${address}\n💰 ${priceStr}\n\nView: ${process.env.FRONTEND_URL || 'https://app.elitenexus.com'}/leads/${lead._id}`;
    
    // Send SMS
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: alertPhone
    });
    
    // Mark as alerted
    lead.alertedAt = new Date();
    await lead.save();
    
    console.log(`[SMS] Alert sent for lead ${lead._id}`);
  } catch (err) {
    // Log error but don't throw - SMS failures should not crash the process
    console.error('[SMS] error sending alert:', err.message);
    // Don't set alertedAt on failure, so it can be retried later if needed
  }
}

/**
 * Sends routing alert for immediate_closer routes
 * Only sends if:
 * - routing.routingAlertedAt is empty/null
 * - Not within quiet hours (if enabled)
 * - Alert channels are enabled
 * 
 * After successful send, sets routing.routingAlertedAt and saves the lead.
 * SMS failures are caught and logged, but do not throw errors.
 * 
 * @param {Object} lead - Lead document
 * @param {Object} routingResult - Routing result from dealRoutingService
 */
async function sendRoutingAlert(lead, routingResult) {
  // Safety check: Only send for immediate_closer routes
  if (routingResult.route !== 'immediate_closer') {
    return;
  }
  
  // Safety check: Only send if not already alerted
  if (lead.routing?.routingAlertedAt) {
    return;
  }
  
  // Check quiet hours
  const { isQuietHours } = require('../config/routingConfig');
  if (isQuietHours()) {
    console.log('[SMS] Routing alert skipped - quiet hours');
    return;
  }
  
  // Check if alerts are enabled
  const config = await require('../config/routingConfig').getRoutingConfig();
  if (!config.alertChannels.sms && !config.alertChannels.internal) {
    console.log('[SMS] Routing alerts disabled');
    return;
  }
  
  // Send SMS if enabled
  if (config.alertChannels.sms && twilioClient) {
    const alertPhone = process.env.ALERT_PHONE_NUMBER;
    if (alertPhone) {
      try {
        const address = lead.propertyAddress || lead.mailingAddress || 'Unknown address';
        const owner = lead.ownerName || 'Unknown owner';
        const score = lead.leadScore?.score || 0;
        const grade = lead.leadScore?.grade || 'Dead';
        const buyBox = lead.leadScore?.buyBoxLabel || 'N/A';
        const price = lead.askingPrice || lead.listPrice;
        const priceStr = price ? `$${price.toLocaleString()}` : 'Price TBD';
        
        const message = `🔥 HOT DEAL - A-GRADE LEAD\n\n${owner}\n📍 ${address}\n💰 ${priceStr}\n📊 Score: ${score} (${grade})\n📦 Buy Box: ${buyBox}\n\nView: ${process.env.FRONTEND_URL || 'https://app.elitenexus.com'}/leads/${lead._id}`;
        
        await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: alertPhone
        });
        
        console.log(`[SMS] Routing alert sent for lead ${lead._id}`);
      } catch (err) {
        console.error('[SMS] error sending routing alert:', err.message);
        // Don't set routingAlertedAt on failure, so it can be retried later if needed
        return;
      }
    }
  }
  
  // Mark as alerted (even if only internal notification was sent)
  if (!lead.routing) {
    lead.routing = {};
  }
  lead.routing.routingAlertedAt = new Date();
  await lead.save();
  
  // TODO: Send internal notification if enabled (webhook, email, etc.)
  if (config.alertChannels.internal) {
    console.log(`[SMS] Internal routing notification for lead ${lead._id}`);
    // Future: Implement internal notification system
  }
}

module.exports = {
  sendNewDealAlert,
  sendRoutingAlert
};

