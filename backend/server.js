// Configure reliable DNS servers for Windows MongoDB SRV resolution
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  console.warn('DNS server override failed, using system defaults.');
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const thesisRoutes = require('./routes/thesis');
const uploadRoutes = require('./routes/upload');
const userRoutes = require('./routes/user');
const membershipRoutes = require('./routes/membership');
const institutionsRoutes = require('./routes/institutions');
const authorsRoutes = require('./routes/authors');
const subjectsRoutes = require('./routes/subjects');
const analyticsRoutes = require('./routes/analytics');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 5000;

// Configuration validation (Priority 0)
if (!process.env.MONGODB_URI) {
  console.error('✗ Fatal Configuration Error: MONGODB_URI environment variable is required.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('✗ Fatal Configuration Error: JWT_SECRET environment variable is required.');
  process.exit(1);
}

// Explicit CORS origin validator (rejects wildcard credentialed CORS)
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  ...(process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim()) : []),
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map((o) => o.trim()) : []),
]);

function isAllowedOrigin(origin) {
  if (!origin) return true; // Allow same-origin / server-to-server / curl / test runners
  return ALLOWED_ORIGINS.has(origin);
}

// HTTP Security Headers & Content Security Policy (compatible with Google sign-in and Vite)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' http://localhost:5000 http://localhost:5173 ws://localhost:5000 ws://localhost:5173 https://api.openalex.org https://api.crossref.org https://api.datacite.org https://zenodo.org https://accounts.google.com; frame-src https://accounts.google.com;"
  );
  next();
});

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS: Origin not allowed by security policy.'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'The Thesis Archive Scholarly Discovery API',
    mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    federatedProviders: ['OpenAlex', 'arXiv', 'Crossref', 'Europe PMC', 'HAL Open Science', 'DOAJ'],
  });
});

// Apply API baseline rate limiter to all API endpoints
app.use('/api', apiLimiter);

const systemRoutes = require('./routes/system');
const { optionalAuth } = require('./middleware/auth');
const { checkMaintenance } = require('./middleware/maintenanceMiddleware');

// Mount public non-maintenance endpoints first
app.use('/api/system', systemRoutes);
app.use('/api/auth', authRoutes);

// Identify user for administrative bypass, then apply maintenance check
app.use(optionalAuth);
app.use(checkMaintenance);

// Mount administrative and research routes
app.use('/api/admin', adminRoutes);
app.use('/api/thesis', thesisRoutes);
app.use('/api/upload', uploadRoutes);
if (userRoutes) {
  app.use('/api/user', userRoutes);
}
app.use('/api/membership', membershipRoutes);
app.use('/api/institutions', institutionsRoutes);
app.use('/api/authors', authorsRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/analytics', analyticsRoutes);

const { searchGlobalDatasets } = require('./services/datasetDiscoveryService');
app.get('/api/datasets', async (req, res) => {
  try {
    const { q, query, page = 1, limit = 15 } = req.query;
    const searchTerm = (q || query || '').trim();
    const result = await searchGlobalDatasets({ query: searchTerm, page, limit });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: 'Dataset discovery error.' });
  }
});

const http = require('http');
const { initSocket } = require('./socket');

const server = http.createServer(app);
initSocket(server);

// Database Connection with DNS SRV Fallback (for Windows local resolvers)
async function startServer() {
  console.log('Connecting to database...');
  try {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
    } catch (err) {
      if (err.message && err.message.includes('querySrv')) {
        console.warn('Local DNS refused SRV resolution. Falling back to Google Public DNS (8.8.8.8)...');
        dns.setServers(['8.8.8.8', '8.8.4.4']);
        await mongoose.connect(process.env.MONGODB_URI);
      } else {
        throw err;
      }
    }

    console.log('✓ Successfully connected to MongoDB database!');
    server.listen(PORT, () => {
      console.log(`✓ Thesis Archive API running on http://localhost:${PORT}`);
      console.log(`✓ Realtime WebSocket engine active on port ${PORT}`);

      // Start periodic topic alert scanner (every 15 minutes)
      const { runAllScheduledAlerts } = require('./services/topicAlertService');
      const ALERT_INTERVAL_MS = 15 * 60 * 1000;
      setInterval(() => {
        runAllScheduledAlerts().catch((err) => console.error('Alerts runner error:', err.message));
      }, ALERT_INTERVAL_MS);
    });
  } catch (err) {
    console.error('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, isAllowedOrigin, startServer };
