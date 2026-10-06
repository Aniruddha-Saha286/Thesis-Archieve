const assert = require('assert');
const { isSafeDatasetUrl, enrichPaperDatasets, searchGlobalDatasets } = require('../services/datasetDiscoveryService');
const MembershipPeriod = require('../models/MembershipPeriod');

async function runDatasetDiscoveryRegressionTests() {
  console.log('Testing: Dataset Discovery & SSRF Security Regression Suite...');

  // --- Test 1: SSRF URL Security Guard ---
  {
    assert.strictEqual(isSafeDatasetUrl('http://127.0.0.1:8080/data'), false, 'SSRF must block 127.0.0.1');
    assert.strictEqual(isSafeDatasetUrl('http://localhost:5000/api'), false, 'SSRF must block localhost');
    assert.strictEqual(isSafeDatasetUrl('http://169.254.169.254/latest/meta-data/'), false, 'SSRF must block AWS metadata');
    assert.strictEqual(isSafeDatasetUrl('http://192.168.1.10/dump.csv'), false, 'SSRF must block private 192.168.x subnet');
    assert.strictEqual(isSafeDatasetUrl('ftp://zenodo.org/data'), false, 'SSRF must block non-HTTP(S) protocols');
    assert.strictEqual(isSafeDatasetUrl('file:///etc/passwd'), false, 'SSRF must block local file:// schemes');

    // Approved scholarly repositories
    assert.strictEqual(isSafeDatasetUrl('https://doi.org/10.5281/zenodo.7627309'), true, 'SSRF must allow doi.org');
    assert.strictEqual(isSafeDatasetUrl('https://api.datacite.org/dois/10.1000/123'), true, 'SSRF must allow datacite.org');
    assert.strictEqual(isSafeDatasetUrl('https://zenodo.org/records/7627309'), true, 'SSRF must allow zenodo.org');
    assert.strictEqual(isSafeDatasetUrl('https://dataverse.harvard.edu/dataset.xhtml'), true, 'SSRF must allow harvard dataverse');
    console.log('  ✓ [PASS] SSRF security guard blocks malicious/private targets while allowing public repositories');
  }

  // --- Test 2: Honest Dataset Enrichment (Linked vs Related) ---
  {
    const enrichment = await enrichPaperDatasets({
      doi: '10.5281/zenodo.7627309',
      title: 'Transferability of Deep Learning Models for Precipitation Super-Resolution',
      explicitDatasetUrl: 'https://zenodo.org/records/7627309',
      explicitDatasetFormat: 'ZIP',
      explicitDatasetSize: '1.4 GB',
    });

    assert.ok(Array.isArray(enrichment.linkedDatasets), 'linkedDatasets must be an array');
    assert.ok(Array.isArray(enrichment.relatedDatasets), 'relatedDatasets must be an array');
    assert.ok(enrichment.linkedDatasets.length > 0, 'Must contain at least 1 linked dataset');

    const primary = enrichment.linkedDatasets[0];
    assert.strictEqual(primary.isLinked, true, 'Primary dataset must be marked isLinked=true');
    assert.strictEqual(primary.formats.includes('ZIP'), true, 'Formats must honestly preserve author deposit format');
    assert.ok(!primary.formats.includes('CSV'), 'Formats must NOT invent fake CSV tags when format is ZIP');
    console.log('  ✓ [PASS] Dataset enrichment strictly distinguishes Linked from Related datasets with honest formats');
  }

  // --- Test 3: Global Dataset Search (DataCite + Zenodo) ---
  {
    const searchRes = await searchGlobalDatasets({
      query: 'climate change precipitation',
      page: 1,
      limit: 6,
    });

    assert.ok(Array.isArray(searchRes.datasets), 'Datasets result must be an array');
    assert.ok(searchRes.datasets.length > 0, 'Dataset search should return open science records');
    for (const ds of searchRes.datasets) {
      assert.ok(ds.url, 'Dataset must have valid access URL');
      assert.ok(isSafeDatasetUrl(ds.url), 'Dataset access URL must pass SSRF safety validation');
      assert.ok(
        ['DataCite', 'Zenodo', 'Figshare', 'Dryad', 'Harvard Dataverse', 'Hugging Face'].includes(ds.source),
        `Source '${ds.source}' must be authentic repository`
      );
    }
    console.log('  ✓ [PASS] Global dataset discovery returns verified DataCite, Zenodo, Figshare & Dryad open science resources');
  }

  // --- Test 4: MembershipPeriod unique index on paymentSubmission ---
  {
    const indexes = MembershipPeriod.schema.indexes();
    const hasUniquePaymentSubIndex = indexes.some(
      ([fields, options]) =>
        fields.paymentSubmission === 1 &&
        options.unique === true &&
        (options.sparse === true || Boolean(options.partialFilterExpression))
    );
    assert.ok(
      hasUniquePaymentSubIndex,
      'MembershipPeriod schema must define unique partial/sparse index on paymentSubmission to prevent double grants'
    );
    console.log('  ✓ [PASS] Database schema prevents double-grant via unique partial index on paymentSubmission');
  }

  // --- Test 5: Cross-Paper Dataset Isolation Guard ---
  {
    // Paper 1: has author-deposited dataset
    const paper1 = await enrichPaperDatasets({
      paperId: 'paper_unique_001',
      doi: '10.5281/zenodo.7627309',
      title: 'Transferability of Deep Learning Models for Precipitation Super-Resolution',
      explicitDatasetUrl: 'https://zenodo.org/records/7627309',
      explicitDatasetFormat: 'ZIP',
      explicitDatasetSize: '1.4 GB',
    });

    assert.ok(paper1.linkedDatasets.some((d) => d.url === 'https://zenodo.org/records/7627309'), 'Paper 1 must have its own deposited dataset');

    // Paper 2: different paper without deposited dataset
    const paper2 = await enrichPaperDatasets({
      paperId: 'paper_unique_002',
      doi: '10.1145/3318464.3389700',
      title: 'Database Concurrency Control in Modern Cloud Depository Systems',
      explicitDatasetUrl: null,
      explicitDatasetFormat: null,
      explicitDatasetSize: null,
    });

    // Paper 2 must NEVER contain Paper 1's dataset!
    const leaked = paper2.linkedDatasets.some((d) => d.url === 'https://zenodo.org/records/7627309');
    assert.strictEqual(leaked, false, 'Paper 2 must NEVER contain datasets belonging to Paper 1 (cross-paper cache leak prevented)');

    // Paper 3 with similar starting title but different ID:
    const paper3 = await enrichPaperDatasets({
      paperId: 'paper_unique_003',
      doi: null,
      title: 'Transferability of Deep Learning Models for Solar Forecasting',
      explicitDatasetUrl: null,
    });

    const leakedTo3 = paper3.linkedDatasets.some((d) => d.url === 'https://zenodo.org/records/7627309');
    assert.strictEqual(leakedTo3, false, 'Paper 3 with similar title prefix must NOT inherit Paper 1 datasets');

    console.log('  ✓ [PASS] Cross-paper dataset isolation guard ensures datasets for Paper 1 never leak to other papers');
  }

  console.log('✓ All Dataset Discovery & Security Regression Tests PASSED.\n');
}

module.exports = { runDatasetDiscoveryRegressionTests };

if (require.main === module) {
  runDatasetDiscoveryRegressionTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
