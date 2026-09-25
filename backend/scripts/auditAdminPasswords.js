#!/usr/bin/env node
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const User = require('../models/User');

const KNOWN_BOOTSTRAP_PASSWORDS = [
  'admin1234',
  'admin',
  'ThesisAdminPass2026!',
  'admin1234!',
  'admin12345',
  'admin@1234',
  'admin123',
  'password',
  'password123',
  'changeme',
];

async function auditAdminPasswords() {
  if (!process.env.MONGODB_URI) {
    console.error('✗ Fatal Error: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database for administrative security audit.');

    const admins = await User.find({ role: 'admin' });
    console.log(`Auditing ${admins.length} registered administrator account(s)...`);

    let vulnerableCount = 0;
    const flaggedAccounts = [];

    for (const admin of admins) {
      if (!admin.password) {
        vulnerableCount++;
        flaggedAccounts.push({
          email: admin.email,
          reason: 'Missing password hash (cannot authenticate via administrative gate)',
        });
        continue;
      }

      let isVulnerable = false;
      for (const candidate of KNOWN_BOOTSTRAP_PASSWORDS) {
        const matches = await bcrypt.compare(candidate, admin.password);
        if (matches) {
          isVulnerable = true;
          break;
        }
      }

      if (isVulnerable) {
        vulnerableCount++;
        flaggedAccounts.push({
          email: admin.email,
          reason: 'Account utilizes a previously known bootstrap or default password sequence',
        });
      }
    }

    console.log('\n======================================================');
    console.log('       ADMINISTRATIVE CREDENTIAL AUDIT REPORT         ');
    console.log('======================================================');

    if (vulnerableCount === 0) {
      console.log('✓ All administrator accounts possess secure, non-bootstrap credentials.');
      console.log('  No immediate password resets required.');
    } else {
      console.warn(`⚠ ALERT: ${vulnerableCount} administrator account(s) require an immediate credential reset:`);
      for (const acc of flaggedAccounts) {
        console.warn(`  - User [${acc.email}]: ${acc.reason}. Reset required.`);
      }
      console.warn('\nTo remediate, execute: node scripts/createAdmin.js <email> <new-strong-password>');
    }
    console.log('======================================================\n');

    await mongoose.disconnect();
    process.exit(vulnerableCount > 0 ? 1 : 0);
  } catch (err) {
    console.error('✗ Security audit execution failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  auditAdminPasswords();
}

module.exports = { auditAdminPasswords, KNOWN_BOOTSTRAP_PASSWORDS };
