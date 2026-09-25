const assert = require('assert');
const { areRecordsDuplicate, mergeTwoRecords, deduplicateRecords } = require('../services/deduplicator');
const { createNormalizedRecord } = require('../services/scholarlyRecord');
const { sameDoiRecordA, sameDoiRecordB } = require('./fixtures/scholarlyFixtures');

function runDeduplicationTests() {
  console.log('Testing: Cross-Provider Deduplication & Metadata Fusion...');

  const recA = createNormalizedRecord(sameDoiRecordA);
  const recB = createNormalizedRecord(sameDoiRecordB);

  // Test 1: Strong identifier matching by DOI
  assert.strictEqual(areRecordsDuplicate(recA, recB), true, 'Records with identical DOI must match');

  // Test 2: Merging complementary metadata
  const merged = mergeTwoRecords(recA, recB);

  // Preserved DOI
  assert.strictEqual(merged.doi, '10.48550/arxiv.1706.03762');

  // Kept abstract from recA (since recB had null abstract)
  assert.ok(merged.abstract && merged.abstract.includes('Transformer'), 'Abstract preserved from provider that supplied it');

  // Kept richer author list from recB (4 authors vs 1 author)
  assert.strictEqual(merged.authors.length, 4, 'Merged record keeps the more detailed author list');

  // Kept direct PDF link from recA (recB had null pdfUrl)
  assert.strictEqual(merged.pdfUrl, 'https://arxiv.org/pdf/1706.03762.pdf');
  assert.strictEqual(merged.isDirectPdf, true);

  // Retained venue and publisher from recB
  assert.strictEqual(merged.venue, 'Advances in Neural Information Processing Systems');
  assert.strictEqual(merged.publisher, 'Curran Associates, Inc.');

  // Retained verified citation count from recA with source
  assert.strictEqual(merged.citationCount, 95000);
  assert.strictEqual(merged.citationSource, 'OpenAlex');

  // Combined sources: both providers retained!
  const providerNames = merged.sources.map((s) => s.provider);
  assert.ok(providerNames.includes('OpenAlex'), 'Retained OpenAlex source link');
  assert.ok(providerNames.includes('Crossref'), 'Retained Crossref source link');

  // Test 3: Deduplicating an array with duplicates
  const list = [recA, recB];
  const deduped = deduplicateRecords(list);
  assert.strictEqual(deduped.length, 1, 'Two records with same DOI must collapse into 1 merged record');

  // Test 4: Distinct works with similar titles must NOT be merged
  const work1 = createNormalizedRecord({
    title: 'Machine Learning for Quantum Chemistries and Molecular Dynamics',
    publishedYear: 2021,
    authors: [{ name: 'Smith, Alice' }],
    doi: '10.1001/work1',
  });

  const work2 = createNormalizedRecord({
    title: 'Machine Learning for Quantum Chemistries and Molecular Dynamics',
    publishedYear: 2024, // 3 years later
    authors: [{ name: 'Johnson, Robert' }], // completely different author
    doi: '10.1001/work2',
  });

  assert.strictEqual(areRecordsDuplicate(work1, work2), false, 'Distinct works with different DOIs and authors must NOT be merged');

  console.log('✓ All Deduplication & Metadata Fusion tests passed successfully.');
}

module.exports = { runDeduplicationTests };

if (require.main === module) {
  runDeduplicationTests();
}
