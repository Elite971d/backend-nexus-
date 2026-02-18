/**
 * EliteNexus Express app - production-ready middleware and routes.
 * Load after validateEnv() in server.js.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const packageJson = require('./package.json');
const { globalLimiter, authLimiter } = require('./src/middleware/rateLimit');
const { requestLogger, correlationIdMiddleware } = require('./src/middleware/requestLogger');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// ---- SECURITY ----
app.use(helmet({
  contentSecurityPolicy: false, // API-only; adjust if serving HTML
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ---- REQUEST LOGGING + CORRELATION ID ----
app.use(requestLogger);
app.use(correlationIdMiddleware);

// ---- INPUT SIZE LIMITS (prevent abuse) ----
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
app.use(cookieParser());

// ---- STRICT CORS: nexus.elitesolutionsnetwork.com only in prod ----
const isProd = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : isProd
    ? ['https://nexus.elitesolutionsnetwork.com']
    : ['https://nexus.elitesolutionsnetwork.com', 'http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'];
app.use(cors({ origin: corsOrigin, credentials: true }));

// ---- RATE LIMITING ----
app.use('/api', globalLimiter);

// ---- STATIC (frontend) - serve from /public if present ----
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// ---- ROOT ----
app.get('/', (req, res) => {
  res.json({
    message: '🚀 EliteNexus Backend Running...',
    version: packageJson.version,
    environment: process.env.NODE_ENV || 'development',
  });
});

// ---- ROUTES ----
// Auth (stricter rate limit)
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));

// Tenants
app.use('/api/tenants', require('./routes/tenantRoutes'));
app.use('/api/tenant', require('./routes/tenantRoutes'));

// Core data
app.use('/api/preforeclosures', require('./routes/preforeclosureRoutes'));
app.use('/api/taxliens', require('./routes/taxLienRoutes'));
app.use('/api/codeviolations', require('./routes/CodeViolationRoutes'));
app.use('/api/probate', require('./routes/probateRoutes'));

// CRM
app.use('/api/crm', require('./routes/crmRoutes'));

// Nexus Deals
app.use('/api/deals', require('./src/routes/deals'));
app.use('/api/activity', require('./src/routes/activity'));

// Exports
app.use('/api', require('./routes/exportRoutes'));

// Letters
app.use('/api/letters', require('./routes/letterRoutes'));
app.use('/api/letter', require('./routes/letterRoutes'));

// Skiptrace & enrichment
app.use('/api/skiptrace', require('./routes/skipTraceRoutes'));
app.use('/api/buyers', require('./routes/buyerRoutes'));

// Buy boxes
app.use('/api/buyboxes', require('./routes/buyBoxRoutes'));
app.use('/api/buyboxes/optimize', require('./routes/buyBoxOptimizationRoutes'));

// Rapid offer
app.use('/api/rapid-offer/dialer', require('./routes/rapidOfferDialerRoutes'));
app.use('/api/rapid-offer/closer', require('./routes/rapidOfferCloserRoutes'));
app.use('/api/rapid-offer/kpi', require('./routes/kpiRoutes'));
app.use('/api/templates', require('./routes/templateRoutes'));

// Deal blast
app.use('/api/deal-blasts', require('./routes/dealBlastRoutes'));

// Buyer feedback & blast
app.use('/api/buyer-feedback', require('./routes/buyerFeedbackRoutes'));
app.use('/api/buyer-blast', require('./routes/buyerBlastRoutes'));

// Webhooks
app.use('/api/webhooks', require('./routes/webhookRoutes'));

// Deal performance
app.use('/api', require('./routes/dealPerformanceRoutes'));

// Underwriting
app.use('/api/underwrite', require('./routes/underwritingRoutes'));

// Notifications & messaging
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));

// ---- CENTRALIZED ERROR HANDLER (must be last) ----
app.use(errorHandler);

module.exports = app;
