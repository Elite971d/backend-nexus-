/**
 * EliteNexus server bootstrap.
 * Validates env, creates app, connects DB, seeds, Socket.IO, listens.
 */
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ---- ENV VALIDATION (fails fast before loading app) ----
const { validateEnv } = require('./src/config/env');
validateEnv();

// ---- GLOBAL ERROR HANDLERS ----
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.error('Error:', err);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...');
  console.error('Reason:', reason);
  setTimeout(() => process.exit(1), 1000);
});

const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const packageJson = require('./package.json');
const seedAdmin = require('./scripts/seedAdmin');
const jwt = require('jsonwebtoken');
const { jwtSecret, cookie: authCookie } = require('./config/auth');
const { setIO } = require('./utils/realtime');

const app = require('./app');
const server = http.createServer(app);

// ---- SOCKET.IO ----
const isProd = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : isProd ? ['https://nexus.elitesolutionsnetwork.com'] : ['https://nexus.elitesolutionsnetwork.com', 'http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'];

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
});

// ---- CONNECT DB WITH RETRY ----
async function connectDBWithRetry(maxRetries = 5, retryDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await connectDB();
      return true;
    } catch (err) {
      console.error(`❌ Database connection attempt ${attempt}/${maxRetries} failed:`, err.message);
      if (attempt === maxRetries) throw err;
      const delay = retryDelay * attempt;
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function startServer() {
  try {
    await connectDBWithRetry();

    seedAdmin().catch((err) => console.error('⚠️  Admin seed (non-fatal):', err.message));

    if (process.env.NODE_ENV !== 'production') {
      require('./scripts/seedDevData')().catch((err) => console.error('⚠️  Dev data seed (non-fatal):', err.message));
    }

    require('./scripts/seedDemoLeads')().catch((err) => console.error('⚠️  Demo leads (non-fatal):', err.message));

    const { runAllCountyScrapers } = require('./scrapers/countyCron');
    runAllCountyScrapers().catch((err) => console.error('⚠️  County scrapers (non-fatal):', err.message));

    const { startCountyCron } = require('./scrapers/countyCron');
    startCountyCron();

    const { startSmsDigestCron } = require('./jobs/sendSmsDigest');
    startSmsDigestCron();

    // ---- SOCKET.IO AUTH & ROOMS ----
    io.use((socket, next) => {
      let token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token && socket.handshake.headers?.cookie) {
        const m = socket.handshake.headers.cookie.match(new RegExp(`${authCookie.name}=([^;]+)`));
        if (m) token = m[1];
      }
      if (!token) return next(new Error('Authentication error: No token provided'));
      try {
        const payload = jwt.verify(token, jwtSecret);
        socket.userId = payload.id;
        socket.userRole = payload.role;
        socket.tenantId = payload.tenantId || null;
        next();
      } catch {
        return next(new Error('Authentication error: Invalid token'));
      }
    });

    io.on('connection', (socket) => {
      socket.join(`user:${socket.userId}`);
      if (socket.userRole) socket.join(`role:${socket.userRole}`);
      if (socket.tenantId) socket.join(`tenant:${socket.tenantId}`);
      socket.on('subscribe:lead', (leadId) => socket.join(`lead:${leadId}`));
      socket.on('unsubscribe:lead', (leadId) => socket.leave(`lead:${leadId}`));
    });

    app.set('io', io);
    setIO(io);

    const PORT = process.env.PORT || 8080;
    const HOST = '0.0.0.0';
    server.listen(PORT, HOST, () => {
      console.log('='.repeat(50));
      console.log('🚀 EliteNexus Backend Started');
      console.log('='.repeat(50));
      console.log(`📦 Version: ${packageJson.version}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔌 Port: ${PORT}`);
      console.log(`🌐 Host: ${HOST}`);
      console.log('✅ MongoDB: Connected');
      console.log('🔌 Socket.IO: Ready');
      console.log('='.repeat(50));
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    if (err.message?.includes('MONGO_URI') || err.message?.includes('MongoDB')) {
      console.error('   fly secrets set MONGO_URI="..."');
    }
    setTimeout(() => process.exit(1), 2000);
  }
}

startServer();
