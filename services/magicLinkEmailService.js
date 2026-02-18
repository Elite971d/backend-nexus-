// services/magicLinkEmailService.js — Send magic-link login email via SMTP
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@nexus.local';

/**
 * Create a reusable transporter (lazy). Returns null if SMTP not configured.
 */
function getTransporter() {
  if (!SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
}

/**
 * Send magic-link login email.
 * @param {Object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.loginLink - Full URL for GET /api/auth/verify?token=...
 * @param {string} [opts.deviceInfo] - e.g. "Chrome on Windows" or "Unknown"
 * @param {string} [opts.ip] - Client IP
 * @param {number} [opts.expiresMinutes=15]
 */
async function sendMagicLinkEmail({ to, loginLink, deviceInfo = 'Unknown', ip = '', expiresMinutes = 15 }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('SMTP not configured: set SMTP_HOST (and SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)');
  }

  const expiresText = expiresMinutes === 1 ? '1 minute' : `${expiresMinutes} minutes`;
  const deviceLine = [deviceInfo, ip].filter(Boolean).join(' — ') || 'Unknown device';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your Nexus login link</title></head>
<body style="font-family: sans-serif; line-height: 1.5;">
  <p>Use the link below to sign in to Nexus. This link is one-time use and expires in <strong>${expiresText}</strong>.</p>
  <p><a href="${loginLink}" style="word-break: break-all;">${loginLink}</a></p>
  <p><small>Requested from: ${deviceLine}</small></p>
  <p><small>If you didn't request this, you can ignore this email.</small></p>
</body>
</html>`;

  const text = `Sign in to Nexus (expires in ${expiresText}):\n${loginLink}\n\nRequested from: ${deviceLine}\n\nIf you didn't request this, ignore this email.`;

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: 'Your Nexus login link',
    text,
    html
  });
}

module.exports = { sendMagicLinkEmail, getTransporter };
