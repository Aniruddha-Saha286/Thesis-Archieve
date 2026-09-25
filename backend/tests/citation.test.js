const assert = require('assert');
const { generateApaCitation, generateBibtex, generateRis, batchExportCitations } = require('../services/citationGenerator');
const { createNormalizedRecord } = require('../services/scholarlyRecord');
const { realThesisFixture, journalArticleFixture, arxivPreprintFixture } = require('./fixtures/scholarlyFixtures');

function runCitationTests() {
  console.log('Testing: Citation Generation (BibTeX, RIS, APA)...');

  // Test 1: Thesis BibTeX export (@phdthesis)
  const thesisRec = createNormalizedRecord(realThesisFixture);
  const thesisBib = generateBibtex(thesisRec);
  assert.ok(thesisBib.citation.startsWith('@phdthesis{'), 'Thesis must format as @phdthesis in BibTeX');
  assert.ok(thesisBib.citation.includes('school = {Sorbonne Université'), 'School must match university');
  assert.ok(thesisBib.citation.includes('year = {2021}'), 'Year must match');

  // Test 2: Journal Article BibTeX export (@article)
  const articleRec = createNormalizedRecord(journalArticleFixture);
  const articleBib = generateBibtex(articleRec);
  assert.ok(articleBib.citation.startsWith('@article{'), 'Journal article must format as @article in BibTeX');
  assert.ok(articleBib.citation.includes('journal = {Nature}'), 'Journal name included');
  assert.ok(articleBib.citation.includes('doi = {10.1038/s41586-020-2314-9}'), 'DOI included');

  // Test 3: Preprint BibTeX export (@misc)
  const preprintRec = createNormalizedRecord(arxivPreprintFixture);
  const preprintBib = generateBibtex(preprintRec);
  assert.ok(preprintBib.citation.startsWith('@misc{'), 'Preprint must format as @misc');

  // Test 4: RIS Export
  const thesisRis = generateRis(thesisRec);
  assert.ok(thesisRis.includes('TY  - THES'), 'Thesis must have TY - THES');
  assert.ok(thesisRis.includes('TI  - Deep Learning Architectures'), 'Title included');
  assert.ok(thesisRis.includes('ER  - '), 'RIS must end with ER tag');

  const articleRis = generateRis(articleRec);
  assert.ok(articleRis.includes('TY  - JOUR'), 'Article must have TY - JOUR');

  // Test 5: APA 7th Edition Formatting
  const apaArticle = generateApaCitation(articleRec);
  assert.ok(apaArticle.citation.includes('(2020)'), 'APA year included');
  assert.ok(apaArticle.citation.includes('Nature'), 'APA journal included');
  assert.ok(apaArticle.citation.includes('https://doi.org/10.1038/s41586-020-2314-9'), 'APA DOI included');
  assert.strictEqual(apaArticle.missingFields.length, 0, 'Complete article should have 0 missing fields');

  // Test 6: Missing fields handling - reports missing fields honestly
  const incompleteRecord = createNormalizedRecord({
    title: 'An Incomplete Working Paper',
    authors: [],
    publishedYear: null,
  });

  const apaIncomplete = generateApaCitation(incompleteRecord);
  assert.ok(apaIncomplete.citation.includes('(n.d.)'), 'Missing year rendered as n.d.');
  assert.ok(apaIncomplete.missingFields.includes('author'), 'Author flagged as missing');
  assert.ok(apaIncomplete.missingFields.includes('year'), 'Year flagged as missing');

  // Test 7: Batch Export
  const batchBib = batchExportCitations([thesisRec, articleRec], 'bibtex');
  assert.ok(batchBib.includes('@phdthesis') && batchBib.includes('@article'), 'Batch export includes all records');

  console.log('✓ All Citation Generation tests passed successfully.');
}

module.exports = { runCitationTests };

if (require.main === module) {
  runCitationTests();
}
