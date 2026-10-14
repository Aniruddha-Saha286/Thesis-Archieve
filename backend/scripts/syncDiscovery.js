const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
if (process.env.DNS_SERVERS) {
  try {
    dns.setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean));
  } catch (_) {}
}

const mongoose = require('mongoose');
const { syncDiscovery } = require('../services/discoveryFeed');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Supply MONGODB_URI explicitly or via backend/.env.');
  await mongoose.connect(uri);
  try {
    const result = await syncDiscovery();
    console.log('✓ Discovery sync completed:', JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((err) => {
  console.error('Discovery sync failed:', err.message || err);
  process.exitCode = 1;
});
