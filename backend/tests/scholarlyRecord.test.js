const assert = require('assert');
const { createNormalizedRecord, normalizeTitle, normalizeDoi } = require('../services/scholarlyRecord');
const {
  realThesisFixture,
  journalArticleFixture,
  arxivPreprintFixture,
  paywalledDoiFixture,
  retractedRecordFixture,
} = require('./fixtures/scholarlyFixtures');

function runScholarlyRecordTests() {
  console.log('Testing: Normalized Scholarly Record & Metadata Mapping...');

  // Test 1: Title normalization
  const dirtyTitle = '  <b>Attention Is All You Need</b>\n  ';
  assert.strictEqual(normalizeTitle(dirtyTitle), 'Attention Is All You Need', 'Title should strip HTML and whitespace');

  // Test 2: DOI normalization
  assert.strictEqual(normalizeDoi('https://doi.org/10.1038/s41586-020-2314-9'), '10.1038/s41586-020-2314-9');
  assert.strictEqual(normalizeDoi('DOI: 10.1016/j.cell.2021.05.001 '), '10.1016/j.cell.2021.05.001');
  assert.strictEqual(normalizeDoi('not-a-doi'), null);

  // Test 3: Real thesis mapping
  const thesisRec = createNormalizedRecord(realThesisFixture);
  assert.strictEqual(thesisRec.publicationType, 'thesis', 'Should identify thesis publication type');
  assert.strictEqual(thesisRec.isDirectPdf, true, 'Thesis has verified direct PDF');
  assert.strictEqual(thesisRec.venue, 'Sorbonne Université • Doctoral School of Informatics');
  assert.ok(thesisRec.pdfUrl.endsWith('/document'), 'PDF URL preserved');

  // Test 4: arXiv preprint mapping (must NOT be labeled peer reviewed!)
  const arxivRec = createNormalizedRecord(arxivPreprintFixture);
  assert.strictEqual(arxivRec.publicationType, 'preprint', 'arXiv work without journal ref must be typed as preprint');
  assert.strictEqual(arxivRec.isPeerReviewed, false, 'arXiv preprints must NOT be labeled peer-reviewed');
  assert.strictEqual(arxivRec.isDirectPdf, true, 'arXiv direct PDF verified');

  // Test 5: Paywalled article mapping
  const paywalledRec = createNormalizedRecord(paywalledDoiFixture);
  assert.strictEqual(paywalledRec.pdfUrl, null, 'Paywalled article must have null direct PDF');
  assert.strictEqual(paywalledRec.isDirectPdf, false, 'isDirectPdf must be false');
  assert.ok(paywalledRec.fullTextUrl.includes('doi.org'), 'Must retain publisher DOI page as fullTextUrl');

  // Test 6: Retraction notice mapping
  const retractedRec = createNormalizedRecord(retractedRecordFixture);
  assert.strictEqual(retractedRec.isRetracted, true, 'Must preserve retraction flag');
  assert.ok(retractedRec.retractionNoticeUrl, 'Must preserve retraction notice link');

  // Test 7: Missing fields represented as null/unknown, never invented
  const sparseRec = createNormalizedRecord({
    title: 'Sparse Work on Quantum Algorithms',
    doi: null,
  });
  assert.strictEqual(sparseRec.abstract, null, 'Missing abstract must be null, not fabricated');
  assert.strictEqual(sparseRec.publishedYear, null, 'Missing year must be null, not fabricated');
  assert.strictEqual(sparseRec.venue, null, 'Missing venue must be null, not fabricated');
  assert.strictEqual(sparseRec.authorDisplay, 'Unknown Author', 'Missing authors marked as Unknown');

  console.log('✓ All Scholarly Record & Metadata Mapping tests passed successfully.');
}

module.exports = { runScholarlyRecordTests };

if (require.main === module) {
  runScholarlyRecordTests();
}
