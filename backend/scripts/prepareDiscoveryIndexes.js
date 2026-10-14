const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
if (process.env.DNS_SERVERS) {
  try {
    dns.setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean));
  } catch (_) {}
}

const mongoose = require('mongoose');
const DiscoveryPaper = require('../models/DiscoveryPaper');
const DiscoverySync = require('../models/DiscoverySync');
const Notification = require('../models/Notification');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Supply MONGODB_URI explicitly or via backend/.env.');
  await mongoose.connect(uri);
  try {
    // createIndexes adds declared indexes without dropping existing indexes or rewriting documents.
    await DiscoveryPaper.createIndexes();
    await DiscoverySync.createIndexes();
    await Notification.createIndexes();
    console.log('✓ Discovery feed and notification deduplication indexes prepared successfully.');
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((err) => {
  console.error('Index preparation failed:', err.message || err);
  process.exitCode = 1;
});
