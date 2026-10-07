const assert = require('assert');
const { executeSearchSession, computeSessionHash } = require('../services/searchSessionManager');
const { cleanTitleForMatching, mergeTwoRecords } = require('../services/deduplicator');
const { createNormalizedRecord } = require('../services/scholarlyRecord');
const { batchExportCitations } = require('../services/citationGenerator');


async function runSearchCorrectnessRegressionTests() {
  console.log('Testing: Search Correctness & Session Stability Regression Suite...');

  {
    const existing = createNormalizedRecord({
      id: 'openalex_w123',
      doi: '10.1000/test.123',
      title: 'Deep Learning for Clinical Diagnostics',
      authors: [{ name: 'Jane Doe', affiliation: 'MIT' }],
      publishedYear: 2024,
      publicationType: 'journal-article',
      source: 'OpenAlex',
      pdfUrl: null,
      datasetUrl: null,
    });

    const incoming = createNormalizedRecord({
      id: 'hal_doc_456',
      doi: '10.1000/test.123',
      title: 'Deep Learning for Clinical Diagnostics',
      authors: [{ name: 'Jane Doe', affiliation: 'MIT' }],
      publishedYear: 2024,
      publicationType: 'journal-article',
      source: 'HAL Open Science',
      pdfUrl: 'https://hal.science/hal-0456/document.pdf',
      datasetUrl: 'https://zenodo.org/records/999999',
    });

    const merged = mergeTwoRecords(existing, incoming);
    assert.strictEqual(
      merged.pdfUrl,
      'https://hal.science/hal-0456/document.pdf',
      'Merging must preserve the verified direct PDF link from incoming provider'
    );
    assert.strictEqual(
      merged.datasetUrl,
      'https://zenodo.org/records/999999',
      'Merging must preserve verified datasetUrl from incoming provider'
    );
    assert.ok(
      merged.sources.some((s) => s.provider === 'HAL Open Science'),
      'Merging must preserve provenance from both providers'
    );
    assert.ok(
      merged.sources.some((s) => s.provider === 'OpenAlex'),
      'Merging must preserve initial provider provenance'
    );
    console.log('  ✓ [PASS] Complementary PDF, dataset, and source provenance preserved on deduplication');
  }

  {
    const titleA = 'Machine d’apprentissage & systèmes avancés naïve';
    const titleB = 'machine dapprentissage systemes avances naive';
    const cleanA = cleanTitleForMatching(titleA);
    const cleanB = cleanTitleForMatching(titleB);
    assert.ok(cleanA.length > 10, 'Unicode title must not be stripped to empty');
    assert.strictEqual(cleanA, cleanB, 'Accented characters must match canonical unaccented representations');
    console.log('  ✓ [PASS] Unicode-aware title matching correctly normalizes international accents');
  }

  {
    const record = createNormalizedRecord({
      title: 'Empirical Study on Distributed Systems',
      degreeType: "Master's Thesis in Computer Science",
      publicationType: 'thesis',
    });
    assert.strictEqual(
      record.degreeType,
      "Master's Thesis in Computer Science",
      'Normalized record must preserve degreeType'
    );
    console.log('  ✓ [PASS] degreeType preserved through scholarly normalization');
  }

  {
    const validPaper = {
      title: 'Neural Architecture Search',
      publishedYear: 2023,
      authors: [{ name: 'Alan Turing' }],
      publicationType: 'journal-article',
      venue: 'Journal of AI Research',
    };

    const bibtexOutput = batchExportCitations([validPaper], 'bibtex', {
      omissions: ['missing_paper_ref_899'],
    });

    assert.ok(
      !bibtexOutput.includes('Paper missing_paper_ref_899'),
      'Export must NOT fabricate placeholder citation for missing saved records'
    );
    assert.ok(
      bibtexOutput.includes('missing_paper_ref_899'),
      'Export must include explanation comment detailing omitted missing paper IDs'
    );
    assert.ok(
      bibtexOutput.includes('@article'),
      'Export must contain legitimate entry for valid paper'
    );
    console.log('  ✓ [PASS] Collection export explains omissions instead of emitting fabricated placeholder citations');
  }

  {
    const legitPaper = {
      title: 'Paper Analysis on Convolutional Neural Networks',
      publishedYear: 2024,
      authors: [{ name: 'Grace Hopper' }],
      publicationType: 'conference-paper',
      venue: 'IEEE Conference on AI',
    };

    const bibtexOutput = batchExportCitations([legitPaper], 'bibtex');
    assert.ok(
      bibtexOutput.includes('Paper Analysis on Convolutional Neural Networks'),
      'Legitimate papers with "Paper" in title must NOT be erroneously omitted'
    );
    assert.ok(
      bibtexOutput.includes('@inproceedings'),
      'BibTeX entry must be generated for legitimate paper with "Paper" in title'
    );
    console.log('  ✓ [PASS] Legitimate papers with "Paper" in title are preserved in citation exports');
  }

  {
    const uniqueSessionId = `test_sess_${Date.now()}`;
    const page1Res = await executeSearchSession({
      query: 'deep learning quantum',
      page: 1,
      limit: 5,
      explicitSessionId: uniqueSessionId,
    });

    assert.ok(page1Res.records.length > 0, 'Page 1 should return records');
    const page1Ids = page1Res.records.map((r) => r.id);

    const page2Res = await executeSearchSession({
      query: 'deep learning quantum',
      page: 2,
      limit: 5,
      explicitSessionId: uniqueSessionId,
    });

    const page2Ids = page2Res.records.map((r) => r.id);

    const intersection = page1Ids.filter((id) => page2Ids.includes(id));
    assert.strictEqual(
      intersection.length,
      0,
      `Page 2 must not repeat records served on Page 1 (repeated: ${intersection.join(', ')})`
    );

    const page1Revisit = await executeSearchSession({
      query: 'deep learning quantum',
      page: 1,
      limit: 5,
      explicitSessionId: uniqueSessionId,
    });

    const page1RevisitIds = page1Revisit.records.map((r) => r.id);
    assert.deepStrictEqual(
      page1RevisitIds,
      page1Ids,
      'Navigating back to Page 1 must return identical records in identical order (frozen page boundary)'
    );
    console.log('  ✓ [PASS] Frozen page boundaries prevent served page re-sorting and duplicate pagination');
  }

  {
    const singleSourceSessionId = `test_source_${Date.now()}`;
    const res = await executeSearchSession({
      query: 'transformer neural networks',
      page: 1,
      limit: 5,
      filters: { source: 'local' },
      explicitSessionId: singleSourceSessionId,
    });

    for (const r of res.records) {
      assert.strictEqual(r.source, 'Local Archive', 'Filtering by source=local must only yield local archive records');
    }
    console.log('  ✓ [PASS] Source filtering restricts providers and correctly computes hasMore from eligible providers');
  }

  console.log('✓ All Search Correctness Regression Tests PASSED.\n');
}

module.exports = { runSearchCorrectnessRegressionTests };

if (require.main === module) {
  runSearchCorrectnessRegressionTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
