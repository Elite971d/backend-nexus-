/**
 * inboundEmailParser.js — Normalize webhook payloads from any forwarder into a canonical shape.
 * No dependency on a specific provider (Zoho, SendGrid, Mailgun, etc.).
 *
 * Input: request body (object or array).
 * Output: array of { messageId, senderEmail, senderName, subject, bodySnippet }.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const FROM_NAME_EMAIL_REGEX = /^\s*(?:(.+?)\s*)?[<(]([^>)]+)[>)]\s*$/;

/**
 * Parse a "From" string like "Name <email@example.com>" or "email@example.com" into name and email.
 * @param {string} from - Raw from header
 * @returns {{ senderName: string | null, senderEmail: string | null }}
 */
function parseFrom(from) {
  if (!from || typeof from !== 'string') {
    return { senderName: null, senderEmail: null };
  }
  const trimmed = from.trim();
  const match = trimmed.match(FROM_NAME_EMAIL_REGEX);
  if (match) {
    const name = (match[1] || '').trim().replace(/^["']|["']$/g, '') || null;
    const email = (match[2] || '').trim() || null;
    return { senderName: name || null, senderEmail: email || null };
  }
  const emailMatch = trimmed.match(EMAIL_REGEX);
  if (emailMatch) {
    return { senderName: null, senderEmail: emailMatch[0] };
  }
  return { senderName: trimmed || null, senderEmail: null };
}

/**
 * Take body text from various common keys and truncate for bodySnippet.
 * @param {object} obj - Single email object
 * @param {number} maxLen - Max length for snippet (default 2000)
 * @returns {string}
 */
function extractBodySnippet(obj, maxLen = 2000) {
  const raw =
    obj.bodySnippet ??
    obj.body ??
    obj.text ??
    obj.plain ?? 
    obj['body-plain'] ??
    obj.html ??
    '';
  const str = typeof raw === 'string' ? raw : String(raw || '');
  const stripped = str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped;
}

/**
 * Normalize a single email object from a webhook into canonical fields.
 * @param {object} item - One email payload (any shape)
 * @returns {{ messageId: string | null, senderEmail: string | null, senderName: string | null, subject: string, bodySnippet: string, from: string | null, to: string[] }}
 */
function normalizeOne(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const fromRaw = item.from ?? item.sender ?? item.from_email ?? item.email ?? '';
  const parsed = parseFrom(fromRaw);
  const senderEmail = item.senderEmail ?? item.sender_email ?? parsed.senderEmail ?? null;
  const senderName = item.senderName ?? item.sender_name ?? parsed.senderName ?? null;
  const subject = [item.subject].filter(Boolean).map(String).join('').trim() || '';
  const bodySnippet = extractBodySnippet(item);
  const messageId =
    item.messageId ??
    item.message_id ??
    item['Message-Id'] ??
    item.id ??
    null;
  const toRaw = item.to ?? item.recipient ?? item.recipients;
  const to = Array.isArray(toRaw)
    ? toRaw.map((t) => (typeof t === 'string' ? t : t?.email ?? t?.address ?? String(t)).trim()).filter(Boolean)
    : typeof toRaw === 'string'
      ? toRaw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    messageId: messageId ? String(messageId).trim() : null,
    senderEmail: senderEmail ? String(senderEmail).trim().toLowerCase() : null,
    senderName: senderName ? String(senderName).trim().slice(0, 200) : null,
    subject: subject.slice(0, 500),
    bodySnippet,
    from: typeof fromRaw === 'string' ? fromRaw.trim().slice(0, 500) : null,
    to
  };
}

/**
 * Parse inbound webhook body into an array of normalized email records.
 * Accepts: single object, { emails: [...] }, or array of objects.
 *
 * @param {object | object[]} body - Request body
 * @returns {Array<{ messageId: string | null, senderEmail: string | null, senderName: string | null, subject: string, bodySnippet: string, from: string | null, to: string[] }>}
 */
function parseInboundPayload(body) {
  if (body == null) {
    return [];
  }
  let items = [];
  if (Array.isArray(body)) {
    items = body;
  } else if (Array.isArray(body.emails)) {
    items = body.emails;
  } else if (Array.isArray(body.inboundEmails)) {
    items = body.inboundEmails;
  } else if (typeof body === 'object' && !Array.isArray(body)) {
    items = [body];
  }
  return items.map(normalizeOne).filter(Boolean);
}

module.exports = {
  parseFrom,
  extractBodySnippet,
  normalizeOne,
  parseInboundPayload
};
