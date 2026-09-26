const assert = require('assert');
const { orchestrateScholarlySearch } = require('../services/searchOrchestrator');
const { searchGlobalDatasets } = require('../services/datasetDiscoveryService');
const institutionService = require('../services/institutionService');
const authorService = require('../services/authorService');
const { getInstitutionResearchLandscape } = require('../services/institutionAnalyticsService');
const { getOrGeneratePaperSummary } = require('../services/paperSummaryService');

async function runLiveSmokeTests() {
  console.log('===============================================================');
  console.log('  PROJECT PANTHER - LIVE SMOKE & EXTERNAL API INTEGRATION TEST  ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${desc}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  // 1. Live Federated Paper Search
  await test('Live Federated Search: retrieves scholarly records from external providers without authentication', async () => {
    const res = await orchestrateScholarlySearch({
      query: 'Quantum computing algorithms',
      page: 1,
      limit: 5,
      filters: {},
    });

    assert(res, 'Search result should be defined');
    assert(Array.isArray(res.records), 'Records should be an array');
    assert(res.pagination, 'Pagination should be present');
    assert(res.providerStatus, 'Provider telemetry should be reported');
    console.log(`    Retrieved ${res.records.length} records. Provider telemetry:`, Object.keys(res.providerStatus));
  });

  // 2. Live Global Dataset Search (DataCite / Zenodo)
  await test('Live Dataset Discovery: retrieves real open science datasets from DataCite and Zenodo', async () => {
    const dsRes = await searchGlobalDatasets({
      query: 'genomics benchmark',
      page: 1,
      limit: 4,
    });

    assert(Array.isArray(dsRes.datasets), 'Datasets should be an array');
    console.log(`    Retrieved ${dsRes.datasets.length} datasets. Outage status: ${dsRes.hasOutage}`);
  });

  // 3. Live Institution Search
  await test('Live Institution Search: queries OpenAlex institution registry', async () => {
    const insts = await institutionService.suggestInstitutions('Oxford', { academicOnly: true, limit: 3 });
    assert(Array.isArray(insts), 'Institutions must be an array');
    assert(insts.length > 0, 'Oxford search should return institutions');
    console.log(`    Found institution: ${insts[0].name} (${insts[0].countryCode || 'N/A'})`);
  });

  // 4. Live Author Search
  await test('Live Author Search: queries OpenAlex author registry with citation metrics', async () => {
    const authors = await authorService.searchAuthors('LeCun', { limit: 3 });
    assert(Array.isArray(authors), 'Authors must be an array');
    assert(authors.length > 0, 'Searching LeCun should return author candidates');
    console.log(`    Found author: ${authors[0].name}, Works: ${authors[0].worksCount}, Citations: ${authors[0].citationCount}`);
  });

  // 5. Live Institution Research Landscape Analytics
  await test('Live Institution Landscape: queries OpenAlex research fields and yearly publication trends', async () => {
    process.env.INSTITUTION_ANALYTICS_ENABLED = 'true';
    const landscape = await getInstitutionResearchLandscape({
      institutionId: 'I40120149', // Oxford
      fromYear: 2022,
      toYear: 2024,
      forceRefresh: true,
    });

    if (landscape.code === 'ANALYTICS_RATE_LIMITED') {
      console.log('    [INFO] OpenAlex upstream rate-limited (HTTP 429). Handled safely by analytics service.');
      assert.strictEqual(landscape.error, true);
    } else {
      assert.strictEqual(landscape.enabled, true);
      assert(landscape.institution, 'Institution metadata should be returned');
      assert(landscape.fieldDistribution, 'Field distribution should be computed');
      assert(landscape.publicationTrends, 'Publication trends should be computed');
      console.log(`    Oxford top discipline: ${landscape.fieldDistribution.slices[0]?.name} (${landscape.fieldDistribution.slices[0]?.percentage}%)`);
    }
  });

  // 6. Live Grounded Paper Summary Generation
  await test('Live Grounded Paper Summary: generates grounded abstract findings and key terms', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';
    const summaryResult = await getOrGeneratePaperSummary({
      paper: {
        id: 'smoke_paper_transformer',
        title: 'Attention Is All You Need',
        abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable.',
      },
      user: {
        _id: 'smoke_user_trial',
        dailySummaryUsage: { date: '2026-09-26', count: 0 },
        save: async () => {},
      },
      scope: 'live_smoke_trial',
      entitlements: {
        plan: 'trial_v2',
        quotas: {
          canUsePaperSummarizer: true,
          dailySummaryGenerationLimit: 3,
          canAccessFullTextSummary: false,
        },
      },
      language: 'en',
    });

    assert.strictEqual(summaryResult.enabled, true);
    assert.strictEqual(summaryResult.coverage, 'abstract_only');
    assert(summaryResult.summary?.tldr, 'Summary should have TLDR');
    assert(summaryResult.summary?.researchObjective, 'Summary should have research objective');
    assert(Array.isArray(summaryResult.summary?.keyTerms), 'Key terms should be an array');
    console.log(`    Generated grounded summary with ${summaryResult.summary.keyTerms.length} key domain terms.`);

    // Verify unauthenticated guest is strictly blocked
    const guestResult = await getOrGeneratePaperSummary({
      paper: { id: 'smoke_guest_check', title: 'Test', abstract: 'Substantial abstract for testing that guest is blocked.' },
      user: null,
      entitlements: { plan: 'guest' },
    });
    assert.strictEqual(guestResult.code, 'FEATURE_LOCKED');
  });

  console.log(`\n===============================================================`);
  console.log(`  ALL ${passed}/${total} LIVE SMOKE TESTS PASSED                  `);
  console.log(`===============================================================\n`);
}

if (require.main === module) {
  runLiveSmokeTests().catch((err) => {
    console.error('\n✗ Live smoke test failed:', err);
    process.exit(1);
  });
}

module.exports = { runLiveSmokeTests };
