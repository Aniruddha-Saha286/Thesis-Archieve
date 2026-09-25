/**
 * Non-destructive DOI Duplicate Audit Migration Script
 * Scans repository records for duplicate Digital Object Identifiers (DOIs).
 * Does NOT delete or mutate records; generates structured audit telemetry
 * for editorial verification.
 */

const mongoose = require('mongoose');
const Thesis = require('../models/Thesis');

async function auditDuplicateDois() {
  console.log('[DOI Audit] Commencing non-destructive DOI duplicate analysis...');

  const duplicateGroups = await Thesis.aggregate([
    {
      $match: {
        doi: { $exists: true, $nin: [null, ''] },
      },
    },
    {
      $project: {
        _id: 1,
        catalogId: 1,
        title: 1,
        doi: 1,
        normalizedDoi: { $toLower: { $trim: { input: '$doi' } } },
        status: 1,
        createdAt: 1,
      },
    },
    {
      $group: {
        _id: '$normalizedDoi',
        count: { $sum: 1 },
        records: {
          $push: {
            id: '$_id',
            catalogId: '$catalogId',
            title: '$title',
            rawDoi: '$doi',
            status: '$status',
            createdAt: '$createdAt',
          },
        },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  const report = {
    auditedAt: new Date().toISOString(),
    totalDuplicateClusters: duplicateGroups.length,
    clusters: duplicateGroups.map((g) => ({
      normalizedDoi: g._id,
      duplicateCount: g.count,
      instances: g.records,
    })),
  };

  if (duplicateGroups.length === 0) {
    console.log('[DOI Audit] Clean repository state: Zero duplicate DOI collisions detected.');
  } else {
    console.warn(`[DOI Audit] Detected ${duplicateGroups.length} DOI collision cluster(s):`);
    duplicateGroups.forEach((g) => {
      console.warn(` - DOI: "${g._id}" appears ${g.count} times:`);
      g.records.forEach((r) => {
        console.warn(`     • [${r.catalogId || r.id}] "${r.title.slice(0, 50)}..." (${r.status})`);
      });
    });
  }

  return report;
}

if (require.main === module) {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/thesis_archive';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('[DOI Audit] Connected to MongoDB.');
      await auditDuplicateDois();
      await mongoose.disconnect();
      console.log('[DOI Audit] Audit complete. Disconnected.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[DOI Audit Error]:', err);
      process.exit(1);
    });
}

module.exports = {
  auditDuplicateDois,
};
