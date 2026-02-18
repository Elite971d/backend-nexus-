// routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const Buyer = require('../models/Buyer');
const DealBlastRecipient = require('../models/DealBlastRecipient');
const BuyerFeedback = require('../models/BuyerFeedback');
const { normalizePhone } = require('../utils/smsBlast');
const { updateBuyerQualityScores } = require('../utils/buyerQualityScoring');
const { runPriceDiscovery } = require('../utils/priceDiscovery');

/**
 * POST /api/webhooks/twilio/inbound
 * Handle inbound SMS from Twilio (opt-out handling)
 * Accepts Twilio form-encoded payload
 */
router.post('/twilio/inbound', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { From, Body } = req.body;
    
    if (!From || !Body) {
      return res.status(400).send('Missing From or Body');
    }
    
    const normalizedPhone = normalizePhone(From);
    if (!normalizedPhone) {
      console.log(`[Twilio Webhook] Invalid phone number: ${From}`);
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
    
    const bodyUpper = Body.toUpperCase().trim();
    const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
    const isOptOut = optOutKeywords.some(keyword => bodyUpper.includes(keyword));
    const isStart = bodyUpper.includes('START');
    
    // Find buyer by phone
    const buyer = await Buyer.findOne({
      $or: [
        { phone: normalizedPhone },
        { phones: normalizedPhone }
      ]
    });
    
    if (isOptOut) {
      // Handle opt-out
      if (buyer) {
        buyer.smsOptOut = true;
        buyer.smsOptOutAt = new Date();
        buyer.smsOptOutReason = Body.substring(0, 100); // Store first 100 chars
        buyer.optOut = { ...buyer.optOut, sms: true, updatedAt: new Date() };
        await buyer.save();
        console.log(`[Twilio Webhook] Buyer ${buyer._id} opted out via SMS`);
      } else {
        console.log(`[Twilio Webhook] Opt-out from unknown number: ${normalizedPhone}`);
      }
      
      // Respond with TwiML
      return res.status(200).send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
        '<Message>You have been unsubscribed from SMS messages. Reply START to re-enable.</Message>' +
        '</Response>'
      );
    }
    
    if (isStart) {
      // Handle re-enable
      if (buyer) {
        buyer.smsOptOut = false;
        buyer.smsOptOutAt = null;
        buyer.smsOptOutReason = null;
        buyer.optOut = { ...buyer.optOut, sms: false, updatedAt: new Date() };
        await buyer.save();
        console.log(`[Twilio Webhook] Buyer ${buyer._id} re-enabled SMS`);
      }
      
      // Respond with TwiML
      return res.status(200).send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
        '<Message>You have been re-subscribed to SMS messages. Reply STOP to opt out.</Message>' +
        '</Response>'
      );
    }
    
    // Other inbound message - parse for feedback
    if (buyer) {
      console.log(`[Twilio Webhook] Inbound message from buyer ${buyer._id}: ${Body.substring(0, 50)}`);
      
      // Try to find recent deal blast recipient for this buyer (within last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentRecipient = await DealBlastRecipient.findOne({
        buyerId: buyer._id,
        channel: 'sms',
        status: { $in: ['sent', 'delivered', 'replied'] },
        sentAt: { $gte: sevenDaysAgo }
      })
        .populate('dealBlastId')
        .sort({ sentAt: -1 });
      
      if (recentRecipient && recentRecipient.dealBlastId) {
        // Parse response text
        const bodyUpper = Body.toUpperCase().trim();
        const bodyLower = Body.toLowerCase().trim();
        
        let responseType = 'pass';
        let status = 'replied';
        
        // YES, INTERESTED, Y, YES PLEASE, etc.
        if (bodyUpper.match(/^(YES|Y|INTERESTED|YES PLEASE|INTERESTED!?)$/)) {
          responseType = 'interested';
          status = 'interested';
        }
        // NO, PASS, N, NOT INTERESTED, etc.
        else if (bodyUpper.match(/^(NO|N|PASS|NOT INTERESTED|NOT INT)$/)) {
          responseType = 'pass';
          status = 'not_interested';
        }
        // TOO HIGH, TOO EXPENSIVE, PRICE TOO HIGH, etc.
        else if (bodyLower.match(/(too\s+high|too\s+expensive|price\s+too\s+high|too\s+much|overpriced)/)) {
          responseType = 'price_too_high';
          status = 'not_interested';
        }
        // WRONG MARKET, WRONG AREA, etc.
        else if (bodyLower.match(/(wrong\s+market|wrong\s+area|not\s+my\s+market|different\s+area)/)) {
          responseType = 'wrong_market';
          status = 'not_interested';
        }
        // MORE INFO, DETAILS, etc.
        else if (bodyLower.match(/(more\s+info|more\s+information|details|tell\s+me\s+more)/)) {
          responseType = 'needs_more_info';
          status = 'replied';
        }
        
        // Update recipient status
        recentRecipient.status = status;
        recentRecipient.respondedAt = new Date();
        recentRecipient.responseText = Body.substring(0, 500); // Limit length
        await recentRecipient.save();
        
        // Create buyer feedback record
        try {
          await BuyerFeedback.create({
            buyerId: buyer._id,
            leadId: recentRecipient.dealBlastId.leadId,
            responseType,
            optionalNotes: Body.substring(0, 500),
            source: 'sms',
            dealBlastRecipientId: recentRecipient._id
          });
          
          // Create message in thread (find or create thread)
          try {
            const MessageThread = require('../models/MessageThread');
            const Message = require('../models/Message');
            const Lead = require('../models/Lead');
            
            // Find or create thread for this buyer and lead
            let thread = await MessageThread.findOne({
              relatedBuyerId: buyer._id,
              relatedLeadId: recentRecipient.dealBlastId.leadId
            });
            
            if (!thread) {
              // Create thread - find users who can see this lead
              const lead = await Lead.findById(recentRecipient.dealBlastId.leadId);
              const User = require('../models/user');
              const users = await User.find({ role: { $in: ['admin', 'closer', 'manager'] } }).limit(1);
              
              thread = await MessageThread.create({
                participants: users.map(u => u._id),
                relatedLeadId: recentRecipient.dealBlastId.leadId,
                relatedBuyerId: buyer._id
              });
            }
            
            // Create inbound message
            await Message.create({
              threadId: thread._id,
              senderId: null, // Buyer, not a user
              senderRole: 'buyer',
              body: Body.substring(0, 1000),
              channel: 'sms',
              externalAddress: normalizedPhone,
              inbound: true
            });
            
            // Update thread last message time
            thread.lastMessageAt = new Date();
            await thread.save();
            
            // Create notifications for thread participants
            const { createNotification } = require('../services/notificationService');
            for (const participantId of thread.participants) {
              await createNotification({
                userId: participantId,
                type: 'system',
                title: 'New Buyer Message',
                message: `${buyer.name || 'Buyer'}: ${Body.substring(0, 50)}`,
                entityType: 'message',
                entityId: thread._id,
                priority: 'normal'
              });
            }
          } catch (msgErr) {
            console.error('[Twilio Webhook] Failed to create message:', msgErr);
            // Don't fail the webhook if message creation fails
          }
          
          // Update buyer quality scores (async)
          updateBuyerQualityScores(buyer._id).catch(err => {
            console.error('Failed to update buyer quality scores:', err);
          });
          
          // Run price discovery (async)
          runPriceDiscovery(recentRecipient.dealBlastId.leadId).catch(err => {
            console.error('Failed to run price discovery:', err);
          });
        } catch (feedbackErr) {
          console.error('[Twilio Webhook] Failed to create buyer feedback:', feedbackErr);
        }
      }
    } else {
      console.log(`[Twilio Webhook] Inbound message from unknown number: ${normalizedPhone}`);
    }
    
    // Respond with empty TwiML (no response message)
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('[Twilio Webhook] Error:', error.message);
    // Always return 200 to Twilio to avoid retries
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

module.exports = router;
