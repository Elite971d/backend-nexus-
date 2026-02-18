// src/routes/inboundEmail.js — POST /api/inbound/email: webhook for forwarded emails → inboundEmails + deals (source=email)
const express = require('express');
const router = express.Router();
const Deal = require('../../models/Deal');
const InboundEmail = require('../../models/InboundEmail');
const { parseInboundPayload } = require('../utils/inboundEmailParser');
const { created, error } = require('../lib/apiResponse');

/**
 * Verify X-INBOUND-SECRET header matches INBOUND_SECRET env.
 * Does not use JWT; intended for any forwarder/webhook tool.
 */
function requireInboundSecret(req, res, next) {
  const secret = process.env.INBOUND_SECRET;
  const header = req.get('X-INBOUND-SECRET');
  if (!secret) {
    return error(res, 'Inbound email not configured', { statusCode: 503, code: 'INBOUND_NOT_CONFIGURED' });
  }
  if (!header || header !== secret) {
    return error(res, 'Invalid or missing inbound secret', { statusCode: 401, code: 'UNAUTHORIZED' });
  }
  next();
}

/**
 * POST /api/inbound/email
 * Body: JSON (single object, or { emails: [...] }, or array).
 * Creates inboundEmail + deal (source=email) per item; skips when messageId already exists.
 */
router.post('/email', requireInboundSecret, async (req, res, next) => {
  try {
    const tenantId = process.env.INBOUND_TENANT_ID;
    if (!tenantId) {
      return error(res, 'Inbound tenant not configured (INBOUND_TENANT_ID)', {
        statusCode: 503,
        code: 'INBOUND_NOT_CONFIGURED'
      });
    }

    const parsed = parseInboundPayload(req.body);
    if (parsed.length === 0) {
      return created(res, { accepted: 0, duplicate: 0, created: [], message: 'No valid email payload' });
    }

    const createdDealIds = [];
    let duplicateCount = 0;

    for (const one of parsed) {
      if (one.messageId) {
        const existing = await InboundEmail.findOne({ messageId: one.messageId }).lean();
        if (existing) {
          duplicateCount += 1;
          continue;
        }
      }

      const deal = await Deal.create({
        tenantId,
        source: 'email',
        status: 'new',
        priority: 'normal',
        createdBy: null,
        assignedTo: null,
        senderName: one.senderName || undefined,
        senderEmail: one.senderEmail || undefined,
        subject: one.subject || undefined,
        bodySnippet: one.bodySnippet || undefined
      });

      await InboundEmail.create({
        tenantId,
        messageId: one.messageId || undefined,
        from: one.from || undefined,
        senderEmail: one.senderEmail || undefined,
        senderName: one.senderName || undefined,
        to: one.to && one.to.length ? one.to : undefined,
        subject: one.subject || undefined,
        bodySnippet: one.bodySnippet || undefined,
        receivedAt: new Date(),
        processedAt: new Date(),
        dealId: deal._id
      });

      createdDealIds.push(deal._id.toString());
    }

    return created(res, {
      accepted: parsed.length,
      duplicate: duplicateCount,
      created: createdDealIds
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
