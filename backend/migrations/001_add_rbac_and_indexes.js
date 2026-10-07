
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const MembershipPeriod = require('../models/MembershipPeriod');

async function runMigration() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[MIGRATION 001] Starting RBAC and index migration (${isDryRun ? 'DRY-RUN' : 'LIVE'})...`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thesis_vault';
  let shouldClose = false;
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
      shouldClose = true;
    }
  } catch (connErr) {
    console.warn(`[MIGRATION 001] Could not connect to MongoDB at ${mongoUri} (${connErr.message}).`);
    console.warn('[MIGRATION 001] Ensure MongoDB daemon is running or MONGODB_URI is configured in .env before executing live migrations.');
    return;
  }

  try {
    console.log('[MIGRATION 001] Inspecting User googleId values for duplicates...');
    const duplicateGoogleIds = await User.aggregate([
      { $match: { googleId: { $ne: null, $exists: true, $ne: '' } } },
      { $group: { _id: '$googleId', count: { $sum: 1 }, users: { $push: { id: '$_id', email: '$email' } } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicateGoogleIds.length > 0) {
      console.error('[MIGRATION 001] WARNING: Found duplicate googleId entries:', JSON.stringify(duplicateGoogleIds, null, 2));
      throw new Error(`Cannot safely create unique sparse index on googleId: ${duplicateGoogleIds.length} duplicate groups found.`);
    } else {
      console.log('[MIGRATION 001] No duplicate googleId values found. Clean to proceed.');
    }

    const usersNeedingPermissions = await User.countDocuments({
      permissions: { $exists: false },
    });
    console.log(`[MIGRATION 001] Users needing permissions array initialized: ${usersNeedingPermissions}`);

    if (!isDryRun) {
      if (usersNeedingPermissions > 0) {
        const updateRes = await User.updateMany(
          { permissions: { $exists: false } },
          { $set: { permissions: [] } }
        );
        console.log(`[MIGRATION 001] Initialized permissions array for ${updateRes.modifiedCount} users.`);
      }

      console.log('[MIGRATION 001] Synchronizing indexes on User model...');
      await User.syncIndexes();

      console.log('[MIGRATION 001] Synchronizing indexes on MembershipPeriod model...');
      await MembershipPeriod.syncIndexes();

      console.log('[MIGRATION 001] All indexes synchronized successfully.');
    } else {
      console.log('[MIGRATION 001] [DRY RUN] Would initialize permissions on users and sync indexes for User and MembershipPeriod.');
    }

    console.log('[MIGRATION 001] Migration completed successfully.');
  } finally {
    if (shouldClose) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRATION 001] Error during migration:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
