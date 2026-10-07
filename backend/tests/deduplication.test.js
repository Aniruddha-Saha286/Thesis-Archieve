const assert = require('assert');
const { areRecordsDuplicate, mergeTwoRecords, deduplicateRecords } = require('../services/deduplicator');
const { createNormalizedRecord } = require('../services/scholarlyRecord');
const { sameDoiRecordA, sameDoiRecordB } = require('./fixtures/scholarlyFixtures');

function runDeduplicationTests() {
  console.log('Testing: Cross-Provider Deduplication & Metadata Fusion...');

  const recA = createNormalizedRecord(sameDoiRecordA);
  const recB = createNormalizedRecord(sameDoiRecordB);

  assert.strictEqual(areRecordsDuplicate(recA, recB), true, 'Records with identical DOI must match');

  const merged = mergeTwoRecords(recA, recB);

  assert.strictEqual(merged.doi, '10.48550/arxiv.1706.03762');

  assert.ok(merged.abstract && merged.abstract.includes('Transformer'), 'Abstract preserved from provider that supplied it');

  assert.strictEqual(merged.authors.length, 4, 'Merged record keeps the more detailed author list');

  assert.strictEqual(merged.pdfUrl, 'https://arxiv.org/pdf/1706.03762.pdf');
  assert.strictEqual(merged.isDirectPdf, true);

  assert.strictEqual(merged.venue, 'Advances in Neural Information Processing Systems');
  assert.strictEqual(merged.publisher, 'Curran Associates, Inc.');

  assert.strictEqual(merged.citationCount, 95000);
  assert.strictEqual(merged.citationSource, 'OpenAlex');

  const providerNames = merged.sources.map((s) => s.provider);
  assert.ok(providerNames.includes('OpenAlex'), 'Retained OpenAlex source link');
  assert.ok(providerNames.includes('Crossref'), 'Retained Crossref source link');

  const list = [recA, recB];
  const deduped = deduplicateRecords(list);
  assert.strictEqual(deduped.length, 1, 'Two records with same DOI must collapse into 1 merged record');

  const work1 = createNormalizedRecord({
    title: 'Machine Learning for Quantum Chemistries and Molecular Dynamics',
    publishedYear: 2021,
    authors: [{ name: 'Smith, Alice' }],
    doi: '10.1001/work1',
  });

  const work2 = createNormalizedRecord({
    title: 'Machine Learning for Quantum Chemistries and Molecular Dynamics',
    publishedYear: 2024,
    authors: [{ name: 'Johnson, Robert' }],
    doi: '10.1001/work2',
  });

  assert.strictEqual(areRecordsDuplicate(work1, work2), false, 'Distinct works with different DOIs and authors must NOT be merged');

  console.log('✓ All Deduplication & Metadata Fusion tests passed successfully.');
}

module.exports = { runDeduplicationTests };

if (require.main === module) {
  runDeduplicationTests();
}
