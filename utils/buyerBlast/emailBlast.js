// utils/buyerBlast/emailBlast.js
/**
 * Buyer Blast Email Utility
 * Sends deal summary emails to matched buyers
 */

const EmailProvider = require('../../services/outboundProviders/emailProvider');

/**
 * Format deal summary for email
 */
function formatDealSummary(lead, options = {}) {
  const {
    maskAddress = false,
    includeFullDetails = true
  } = options;

  const address = lead.propertyAddress || lead.dialerIntake?.propertyAddress || 'Address not available';
  const maskedAddress = maskAddress && address ? 
    address.split(' ').slice(0, -1).join(' ') + ' [REDACTED]' : 
    address;

  const beds = lead.beds || lead.dialerIntake?.beds || 'N/A';
  const baths = lead.baths || lead.dialerIntake?.baths || 'N/A';
  const sqft = lead.sqft || lead.dialerIntake?.sqft || 'N/A';
  const price = lead.askingPrice || lead.listPrice || lead.dialerIntake?.askingPrice || 'N/A';
  const county = lead.county || lead.dialerIntake?.county || 'N/A';
  const city = lead.city || lead.dialerIntake?.city || 'N/A';
  const state = lead.state || lead.dialerIntake?.state || 'N/A';
  const condition = lead.dialerIntake?.conditionTier || lead.conditionTier || 'N/A';
  const yearBuilt = lead.yearBuilt || lead.dialerIntake?.yearBuilt || 'N/A';
  const propertyType = lead.dialerIntake?.propertyType || lead.propertyType || 'N/A';

  const priceFormatted = typeof price === 'number' ? `$${price.toLocaleString()}` : price;
  const sqftFormatted = typeof sqft === 'number' ? sqft.toLocaleString() : sqft;

  // Plain text version
  const textSummary = `
NEW DEAL OPPORTUNITY

Property Details:
${maskedAddress}
${city}, ${state} ${lead.zip || ''}
County: ${county}

Property Type: ${propertyType}
Beds: ${beds} | Baths: ${baths} | SqFt: ${sqftFormatted}
Year Built: ${yearBuilt}
Condition: ${condition}

Price/Terms: ${priceFormatted}

${includeFullDetails ? `
Additional Information:
${lead.description || lead.dialerIntake?.notes || 'No additional details available'}
` : ''}

---
This is a deal opportunity from Elite Nexus CRM.
Reply YES to express interest or request more information.
To opt out, reply STOP or UNSUBSCRIBE.
  `.trim();

  // HTML version
  const htmlSummary = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .property-details { background-color: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .detail-row { margin: 8px 0; }
    .label { font-weight: bold; color: #555; }
    .cta { background-color: #2196F3; color: white; padding: 15px; text-align: center; margin: 20px 0; border-radius: 5px; }
    .footer { font-size: 12px; color: #777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="header">
    <h1>NEW DEAL OPPORTUNITY</h1>
  </div>
  <div class="content">
    <div class="property-details">
      <div class="detail-row"><span class="label">Address:</span> ${maskedAddress}</div>
      <div class="detail-row"><span class="label">Location:</span> ${city}, ${state} ${lead.zip || ''}</div>
      <div class="detail-row"><span class="label">County:</span> ${county}</div>
      <div class="detail-row"><span class="label">Property Type:</span> ${propertyType}</div>
      <div class="detail-row"><span class="label">Beds:</span> ${beds} | <span class="label">Baths:</span> ${baths} | <span class="label">SqFt:</span> ${sqftFormatted}</div>
      <div class="detail-row"><span class="label">Year Built:</span> ${yearBuilt}</div>
      <div class="detail-row"><span class="label">Condition:</span> ${condition}</div>
      <div class="detail-row"><span class="label">Price/Terms:</span> ${priceFormatted}</div>
    </div>
    ${includeFullDetails && (lead.description || lead.dialerIntake?.notes) ? `
    <div>
      <h3>Additional Information:</h3>
      <p>${(lead.description || lead.dialerIntake?.notes || '').replace(/\n/g, '<br>')}</p>
    </div>
    ` : ''}
    <div class="cta">
      <p><strong>Interested in this deal?</strong></p>
      <p>Reply YES to express interest or request more information.</p>
    </div>
    <div class="footer">
      <p>This is a deal opportunity from Elite Nexus CRM.</p>
      <p>To opt out, reply STOP or UNSUBSCRIBE.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { text: textSummary, html: htmlSummary };
}

/**
 * Send buyer blast email
 * @param {Object} lead - Lead document
 * @param {Array} buyers - Array of buyer documents
 * @param {Object} options - Options for email sending
 * @returns {Promise<Object>} Results with sent/failed counts
 */
async function sendBuyerBlast(lead, buyers, options = {}) {
  const {
    maskAddress = false,
    includeFullDetails = true,
    subject = null
  } = options;

  const emailProvider = new EmailProvider();
  const dealSummary = formatDealSummary(lead, { maskAddress, includeFullDetails });

  const results = {
    sent: [],
    failed: [],
    total: buyers.length
  };

  const emailSubject = subject || `New Deal Opportunity - ${lead.propertyAddress || 'Property'}`;

  for (const buyer of buyers) {
    try {
      // Check opt-out
      if (buyer.optOut?.email) {
        results.failed.push({
          buyerId: buyer._id,
          buyerName: buyer.name,
          reason: 'Buyer opted out of emails'
        });
        continue;
      }

      // Check cooldown
      if (buyer.lastBlastAt && buyer.cooldownHours) {
        const hoursSinceLastBlast = (Date.now() - buyer.lastBlastAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastBlast < buyer.cooldownHours) {
          results.failed.push({
            buyerId: buyer._id,
            buyerName: buyer.name,
            reason: `Cooldown active (${Math.round(buyer.cooldownHours - hoursSinceLastBlast)} hours remaining)`
          });
          continue;
        }
      }

      // Get buyer email
      const buyerEmail = buyer.email || (buyer.emails && buyer.emails.length > 0 ? buyer.emails[0] : null);
      if (!buyerEmail) {
        results.failed.push({
          buyerId: buyer._id,
          buyerName: buyer.name,
          reason: 'No email address available'
        });
        continue;
      }

      // Send email
      if (emailProvider.isConfigured()) {
        await emailProvider.send({
          to: buyerEmail,
          subject: emailSubject,
          message: dealSummary.text,
          html: dealSummary.html,
          metadata: {
            leadId: lead._id.toString(),
            buyerId: buyer._id.toString(),
            type: 'buyer_blast'
          }
        });
      } else {
        // Stub mode - just log
        console.log(`[Buyer Blast] Would send email to ${buyerEmail} for lead ${lead._id}`);
        console.log(`[Buyer Blast] Subject: ${emailSubject}`);
        console.log(`[Buyer Blast] Deal summary length: ${dealSummary.text.length} chars`);
      }

      // Update buyer lastBlastAt
      buyer.lastBlastAt = new Date();
      await buyer.save();

      results.sent.push({
        buyerId: buyer._id,
        buyerName: buyer.name,
        email: buyerEmail
      });
    } catch (error) {
      console.error(`[Buyer Blast] Error sending to buyer ${buyer._id}:`, error.message);
      results.failed.push({
        buyerId: buyer._id,
        buyerName: buyer.name,
        reason: error.message
      });
    }
  }

  return results;
}

module.exports = {
  sendBuyerBlast,
  formatDealSummary
};

