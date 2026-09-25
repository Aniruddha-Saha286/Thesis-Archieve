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

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
}));
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

// Mount Routes
app.use('/api/auth', authRoutes);
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

startServer();

module.exports = { app, server };
