
const mongoose = require('mongoose');
const Thesis = require('../models/Thesis');
const { CURATED_INSTITUTIONS } = require('../services/institutionService');

const KNOWN_INSTITUTION_COUNTRY_MAP = [
  { pattern: /bangladesh\s+university\s+of\s+engineering|buet/i, code: 'BD', name: 'BUET' },
  { pattern: /university\s+of\s+dhaka|\bdhaka\s+university\b|\bdu\b/i, code: 'BD', name: 'University of Dhaka' },
  { pattern: /jahangirnagar\s+university|\bju\b/i, code: 'BD', name: 'Jahangirnagar University' },
  { pattern: /rajshahi\s+university|\bru\b/i, code: 'BD', name: 'Rajshahi University' },
  { pattern: /shahjalal\s+university|sust/i, code: 'BD', name: 'SUST' },
  { pattern: /khulna\s+university\s+of\s+engineering|kuet/i, code: 'BD', name: 'KUET' },
  { pattern: /chittagong\s+university\s+of\s+engineering|cuet/i, code: 'BD', name: 'CUET' },
  { pattern: /dhaka\s+international\s+university|\bdiu\b|daffodil/i, code: 'BD', name: 'Daffodil / DIU' },
  { pattern: /brac\s+university/i, code: 'BD', name: 'BRAC University' },
  { pattern: /north\s+south\s+university|\bnsu\b/i, code: 'BD', name: 'North South University' },
  { pattern: /islamic\s+university\s+of\s+technology|\biut\b/i, code: 'BD', name: 'IUT' },
  { pattern: /ahsanullah\s+university|aust/i, code: 'BD', name: 'AUST' },
  { pattern: /east\s+west\s+university|\bewu\b/i, code: 'BD', name: 'East West University' },
  { pattern: /united\s+international\s+university|\buiu\b/i, code: 'BD', name: 'UIU' },
  { pattern: /american\s+international\s+university[- ]bangladesh|\baiub\b/i, code: 'BD', name: 'AIUB' },
  
  { pattern: /massachusetts\s+institute\s+of\s+technology|\bmit\b/i, code: 'US', name: 'MIT' },
  { pattern: /harvard\s+university/i, code: 'US', name: 'Harvard University' },
  { pattern: /stanford\s+university/i, code: 'US', name: 'Stanford University' },
  { pattern: /university\s+of\s+california|berkeley|ucla/i, code: 'US', name: 'UC System' },
  { pattern: /carnegie\s+mellon/i, code: 'US', name: 'Carnegie Mellon University' },
  { pattern: /columbia\s+university/i, code: 'US', name: 'Columbia University' },
  { pattern: /cornell\s+university/i, code: 'US', name: 'Cornell University' },
  { pattern: /princeton\s+university/i, code: 'US', name: 'Princeton University' },

  { pattern: /university\s+of\s+oxford|\boxford\b/i, code: 'GB', name: 'University of Oxford' },
  { pattern: /university\s+of\s+cambridge|\bcambridge\b/i, code: 'GB', name: 'University of Cambridge' },
  { pattern: /imperial\s+college\s+london/i, code: 'GB', name: 'Imperial College London' },
  { pattern: /university\s+college\s+london|\bucl\b/i, code: 'GB', name: 'UCL' },
  { pattern: /university\s+of\s+edinburgh/i, code: 'GB', name: 'University of Edinburgh' },
];

function resolveCountryCodeForThesis(doc) {
  const uni = (doc.university || '').trim();
  const awardName = (doc.awardingInstitution?.name || '').trim();
  const rawAffil = (doc.authorships?.[0]?.rawAffiliation || '').trim();
  const candidates = [uni, awardName, rawAffil].filter(Boolean);

  for (const text of candidates) {
    for (const cur of CURATED_INSTITUTIONS) {
      if (text.toLowerCase().includes(cur.name.toLowerCase())) {
        return { code: cur.countryCode, source: `curated:${cur.name}` };
      }
      if (Array.isArray(cur.aliases)) {
        for (const alias of cur.aliases) {
          if (text.toLowerCase().includes(alias.toLowerCase())) {
            return { code: cur.countryCode, source: `curated_alias:${alias}` };
          }
        }
      }
    }
  }

  for (const text of candidates) {
    for (const item of KNOWN_INSTITUTION_COUNTRY_MAP) {
      if (item.pattern.test(text)) {
        return { code: item.code, source: `pattern:${item.name}` };
      }
    }
  }

  if (Array.isArray(doc.authorships)) {
    for (const auth of doc.authorships) {
      for (const inst of auth.institutions || []) {
        if (inst.countryCode && /^[A-Z]{2}$/i.test(inst.countryCode)) {
          return { code: inst.countryCode.toUpperCase(), source: 'existing_authorship' };
        }
      }
    }
  }

  return null;
}

async function backfillThesisCountryCodes(options = {}) {
  const apply = Boolean(options.apply);
  console.log(`[Backfill Country Codes] Running in mode: ${apply ? 'APPLY (modifying database)' : 'DRY-RUN (read-only preview)'}...`);

  const thesesWithoutCountry = await Thesis.find({
    $or: [
      { countryCode: null },
      { countryCode: '' },
      { countryCode: { $exists: false } },
    ],
  }).lean();

  console.log(`[Backfill Country Codes] Found ${thesesWithoutCountry.length} records missing top-level countryCode.`);

  let matchedCount = 0;
  let skippedCount = 0;
  const updates = [];

  for (const doc of thesesWithoutCountry) {
    const resolved = resolveCountryCodeForThesis(doc);
    if (resolved) {
      matchedCount++;
      updates.push({
        id: doc._id,
        catalogId: doc.catalogId,
        title: doc.title,
        university: doc.university,
        assignedCode: resolved.code,
        source: resolved.source,
      });

      if (apply) {
        await Thesis.updateOne(
          { _id: doc._id },
          {
            $set: {
              countryCode: resolved.code,
              'awardingInstitution.countryCode': doc.awardingInstitution?.countryCode || resolved.code,
            },
          }
        );
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`[Backfill Country Codes] Result: ${matchedCount} matched, ${skippedCount} left null (unambiguous honesty preserved).`);
  return {
    mode: apply ? 'apply' : 'dry-run',
    scanned: thesesWithoutCountry.length,
    matchedCount,
    skippedCount,
    sampleUpdates: updates.slice(0, 10),
  };
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thesis-vault';

  mongoose.connect(mongoUri)
    .then(async () => {
      const result = await backfillThesisCountryCodes({ apply });
      console.log('Migration summary:', JSON.stringify(result, null, 2));
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  backfillThesisCountryCodes,
  resolveCountryCodeForThesis,
};
