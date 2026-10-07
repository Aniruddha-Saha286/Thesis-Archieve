
const mongoose = require('mongoose');
const TrialGrant = require('../models/TrialGrant');

async function migrateHistoricalTrials() {
  const filter = {
    $or: [
      { policyVersion: { $exists: false } },
      { policyVersion: null },
      { policyVersion: '' },
    ],
  };

  const pendingCount = await TrialGrant.countDocuments(filter);
  console.log(`[Migration] Found ${pendingCount} historical trial grants lacking policyVersion.`);

  if (pendingCount === 0) {
    console.log('[Migration] No trial records require migration.');
    return { modifiedCount: 0 };
  }

  const result = await TrialGrant.updateMany(filter, {
    $set: { policyVersion: 'v1' },
  });

  console.log(`[Migration] Successfully updated ${result.modifiedCount} historical trials to policyVersion 'v1'.`);
  return result;
}

if (require.main === module) {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/thesis_archive';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('[Migration] Connected to MongoDB.');
      await migrateHistoricalTrials();
      await mongoose.disconnect();
      console.log('[Migration] Migration complete. Disconnected.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration Error]:', err);
      process.exit(1);
    });
}

module.exports = {
  migrateHistoricalTrials,
};
