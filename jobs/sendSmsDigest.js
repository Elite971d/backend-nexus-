// jobs/sendSmsDigest.js
// Daily SMS digest sender - runs at 9:00 AM America/Chicago
// Sends consolidated SMS to buyers with queued deals

const cron = require('node-cron');
const DigestQueue = require('../models/DigestQueue');
const Buyer = require('../models/Buyer');
const Lead = require('../models/Lead');
const BuyerBlastLog = require('../models/BuyerBlastLog');
const { sendSmsToBuyer, normalizePhone } = require('../utils/smsBlast');

/**
 * Format digest SMS message
 * @param {Array} items - Array of { leadId, matchScore, lead }
 * @returns {string} Formatted digest message
 */
function formatDigestMessage(items) {
  const maxItems = 5; // Top 5 deals
  const topItems = items.slice(0, maxItems);
  
  let message = `Elite Nexus Deals (DFW) – ${items.length} match${items.length > 1 ? 'es' : ''} today:\n\n`;
  
  topItems.forEach((item, index) => {
    const lead = item.lead;
    if (!lead) return; // Skip if lead not found
    
    const city = lead.city || lead.county || 'Location';
    const propertyType = lead.dialerIntake?.propertyType || lead.propertyType || 'Property';
    const beds = lead.dialerIntake?.beds || lead.beds;
    const baths = lead.dialerIntake?.baths || lead.baths;
    const sqft = lead.dialerIntake?.sqft || lead.sqft;
    const price = lead.dialerIntake?.askingPrice || lead.askingPrice || lead.listPrice;
    
    let dealLine = `${index + 1}) ${city} – ${propertyType}`;
    if (beds && baths) {
      dealLine += ` ${beds}/${baths}`;
    }
    if (sqft) {
      dealLine += ` ${sqft}sf`;
    }
    if (price) {
      dealLine += ` $${price.toLocaleString()}`;
    }
    
    message += dealLine + '\n';
  });
  
  if (items.length > maxItems) {
    message += `\n+${items.length - maxItems} more deals\n`;
  }
  
  message += '\nReply # + YES for details. STOP to opt out.';
  
  return message;
}

/**
 * Send daily digest for a buyer
 * @param {Object} queue - DigestQueue document
 * @returns {Promise<Object>} { sent: boolean, error?: string }
 */
async function sendBuyerDigest(queue) {
  try {
    const buyer = await Buyer.findById(queue.buyerId);
    if (!buyer) {
      return { sent: false, error: 'Buyer not found' };
    }
    
    // Check opt-out
    if (buyer.smsOptOut || buyer.optOut?.sms) {
      return { sent: false, error: 'Buyer opted out' };
    }
    
    // Check active
    if (!buyer.active) {
      return { sent: false, error: 'Buyer not active' };
    }
    
    // Get phone
    const phone = normalizePhone(buyer.phone || (buyer.phones && buyer.phones[0]));
    if (!phone) {
      return { sent: false, error: 'No valid phone number' };
    }
    
    // Check preferred contact
    if (buyer.preferredContact && buyer.preferredContact !== 'sms' && buyer.preferredContact !== 'both') {
      return { sent: false, error: 'Buyer prefers email' };
    }
    
    // Get leads
    const leadIds = queue.items.map(item => item.leadId);
    const leads = await Lead.find({ _id: { $in: leadIds } });
    
    // Sort by match score (descending) and filter out missing leads
    const itemsWithLeads = queue.items
      .map(item => {
        const lead = leads.find(l => l._id.toString() === item.leadId.toString());
        return { ...item, lead };
      })
      .filter(item => item.lead) // Filter out missing leads
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    
    if (itemsWithLeads.length === 0) {
      // Clear queue if no valid leads
      queue.items = [];
      await queue.save();
      return { sent: false, error: 'No valid leads found' };
    }
    
    // Format message
    const message = formatDigestMessage(itemsWithLeads);
    
    // Send SMS
    const result = await sendSmsToBuyer({
      buyerId: buyer._id,
      leadId: itemsWithLeads[0]?.leadId || leadIds[0], // Use first lead ID for logging
      message,
      userId: null // System user
    });
    
    if (result.success) {
      // Update queue
      queue.items = [];
      queue.lastDigestSentAt = new Date();
      await queue.save();
      
      // Update buyer
      buyer.lastSmsSentAt = new Date();
      await buyer.save();
      
      // Log blast
      await BuyerBlastLog.create({
        leadId: itemsWithLeads[0]?.leadId || leadIds[0],
        buyerIds: [buyer._id],
        channel: 'digest',
        messagePreview: message.substring(0, 100),
        sentCount: 1,
        failedCount: 0,
        createdByUserId: null // System
      });
      
      return { sent: true };
    } else {
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error(`[SMS Digest] Error sending to buyer ${queue.buyerId}:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Process all digest queues
 */
async function processDigestQueues() {
  console.log('[SMS Digest] Starting daily digest processing...');
  
  try {
    // Get all queues with items
    const queues = await DigestQueue.find({
      'items.0': { $exists: true } // Has at least one item
    });
    
    console.log(`[SMS Digest] Found ${queues.length} buyers with queued items`);
    
    let sentCount = 0;
    let failedCount = 0;
    
    for (const queue of queues) {
      const result = await sendBuyerDigest(queue);
      
      if (result.sent) {
        sentCount++;
      } else {
        failedCount++;
        console.log(`[SMS Digest] Failed for buyer ${queue.buyerId}: ${result.error}`);
      }
      
      // Small delay between sends to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[SMS Digest] Completed: ${sentCount} sent, ${failedCount} failed`);
  } catch (error) {
    console.error('[SMS Digest] Error processing queues:', error.message);
  }
}

/**
 * Start daily digest cron job
 * Runs at 9:00 AM America/Chicago timezone
 */
function startSmsDigestCron() {
  // Schedule: 9:00 AM America/Chicago (14:00 UTC during standard time, 13:00 UTC during DST)
  // Using 14:00 UTC as default (adjust if needed for DST)
  const cronSchedule = '0 14 * * *'; // 9:00 AM CT (approximate, adjust for DST)
  
  console.log('[SMS Digest] Starting cron job - scheduled for 9:00 AM CT daily');
  
  cron.schedule(cronSchedule, async () => {
    console.log('[SMS Digest] Cron triggered');
    await processDigestQueues();
  }, {
    timezone: 'America/Chicago'
  });
}

module.exports = {
  processDigestQueues,
  startSmsDigestCron,
  sendBuyerDigest
};
