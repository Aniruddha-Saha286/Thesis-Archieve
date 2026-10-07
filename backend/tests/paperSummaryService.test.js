const assert = require('assert');
const { getDhakaDateString } = require('../utils/dhakaDate');
const {
  getOrGeneratePaperSummary,
  extractGroundedAbstractSummary,
  extractKeyTerms,
  splitIntoSentences,
} = require('../services/paperSummaryService');
const { isValidHttpUrl, isPrivateIpOrHost, isValidDatasetRepositoryUrl } = require('../utils/urlValidator');

async function runPaperSummaryTests() {
  console.log('===============================================================');
  console.log('  TEST SUITE: GROUNDED QUICK SUMMARY & SECURITY ENFORCEMENTS   ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(description, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${description}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  await test('Feature flag disabled: returns enabled: false without executing generation', async () => {
    const orig = process.env.PAPER_SUMMARIZER_ENABLED;
    process.env.PAPER_SUMMARIZER_ENABLED = 'false';

    const res = await getOrGeneratePaperSummary({
      paper: {
        title: 'Title',
        abstract: 'A very detailed abstract about advanced quantum computing algorithms and error correction.',
      },
    });

    assert.strictEqual(res.enabled, false);
    assert.ok(res.message.includes('disabled'));
    process.env.PAPER_SUMMARIZER_ENABLED = orig;
  });

  await test('Honesty guard: returns unavailable if abstract is missing or too short, never hallucinates', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const res = await getOrGeneratePaperSummary({
      paper: {
        title: 'Deep Learning for Everything',
        abstract: 'Too short',
      },
      user: null,
      entitlements: null,
    });

    assert.strictEqual(res.enabled, true);
    assert.strictEqual(res.coverage, 'unavailable');
    assert.ok(res.message.includes('no abstract long enough'));
  });

  await test('Abstract-only grounding: parses objective, methodology, dataset, and findings directly from text', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const abstract =
      'The objective of this research is to investigate graph neural network representations for molecular property prediction. ' +
      'Our method introduces a relational message-passing framework evaluated on the QM9 benchmark dataset. ' +
      'Experimental results demonstrate that our proposed architecture outperforms baseline models with 14% lower mean absolute error. ' +
      'A notable limitation of this approach is the high computational complexity on dense graphs.';

    const dummyUser = {
      _id: 'usr_mock_1',
      dailySummaryUsage: { date: '2026-09-25', count: 0 },
      save: async () => {},
    };

    const entitlements = {
      plan: 'trial_v2',
      quotas: {
        dailySummaryGenerationLimit: 3,
        canAccessFullTextSummary: true,
      },
    };

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_101',
        title: 'Graph Neural Networks for Chemistry',
        abstract,
      },
      user: dummyUser,
      entitlements,
      language: 'en',
    });

    assert.strictEqual(res.enabled, true);
    assert.strictEqual(res.coverage, 'abstract_only');
    assert.strictEqual(res.cached, false);
    assert.ok(res.summary.tldr.length > 20);
    assert.ok(res.summary.researchObjective.toLowerCase().includes('objective'));
    assert.ok(res.summary.methodology.toLowerCase().includes('method'));
    assert.ok(res.summary.datasetSample.toLowerCase().includes('qm9'));
    assert.ok(res.summary.mainFindings.toLowerCase().includes('outperforms'));
    assert.ok(res.summary.limitations.toLowerCase().includes('limitation'));
    assert.ok(Array.isArray(res.summary.keyTerms));
    assert.ok(res.summary.keyTerms.length >= 3);
    assert.ok(res.summary.disclaimer.includes('Not written by AI'));
    assert.strictEqual(res.summary.isAiGenerated, false);
    assert.ok(!res.summary.methodology.toLowerCase().includes('outperforms'));
    assert.ok(!res.summary.mainFindings.toLowerCase().includes('limitation'));
    assert.strictEqual(res.summary.relevanceForThesisResearch, '');
    assert.strictEqual(res.summary.plainLanguageOverview, '');
    assert.strictEqual(typeof res.summary.found, 'object');
    assert.strictEqual(res.summary.found.findings, true);
  });

  await test('Bengali language output: formats grounded sections with Bangla localization', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const abstract =
      'The objective of this study is to analyze speech sentiment in low-resource Bengali dialects. ' +
      'Our method introduces a self-supervised acoustic feature extractor tested on 500 audio samples. ' +
      'Findings indicate a 7% accuracy increase over baseline Mel-spectrogram models.';

    const dummyUser = {
      _id: 'usr_mock_bn',
      dailySummaryUsage: { date: '2026-09-25', count: 0 },
      save: async () => {},
    };

    const entitlements = {
      plan: 'premium_6m',
      quotas: {
        dailySummaryGenerationLimit: 15,
        canAccessFullTextSummary: true,
      },
    };

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_bn_01',
        title: 'Bengali Dialect Speech Sentiment',
        abstract,
      },
      user: dummyUser,
      entitlements,
      language: 'bn',
    });

    assert.strictEqual(res.enabled, true);
    assert.strictEqual(res.language, 'bn');
    assert.ok(res.summary.tldr.includes('[সারাংশ]'));
    assert.ok(res.summary.disclaimer.includes('কৃত্রিম বুদ্ধিমত্তার লেখা নয়'));
  });

  await test('Cache deduplication: subsequent identical request returns cached result with cached: true', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const abstract =
      'This study examines perovskite photovoltaic durability under humid climatic conditions. ' +
      'We fabricated 40 planar heterojunction cells and evaluated degradation curves over 1,000 hours. ' +
      'Findings indicate that fluorine-doped coatings preserve 88% efficiency.';

    const dummyUser = {
      _id: 'usr_mock_cache',
      dailySummaryUsage: { date: '2026-09-25', count: 0 },
      save: async function () { this.dailySummaryUsage.count++; },
    };

    const entitlements = {
      plan: 'trial_v2',
      quotas: {
        canUsePaperSummarizer: true,
        dailySummaryGenerationLimit: 3,
        canAccessFullTextSummary: false,
      },
    };

    const firstRun = await getOrGeneratePaperSummary({
      paper: { id: 'paper_solar_99', title: 'Perovskite Cells', abstract },
      user: dummyUser,
      entitlements,
    });
    assert.strictEqual(firstRun.cached, false);

    const secondRun = await getOrGeneratePaperSummary({
      paper: { id: 'paper_solar_99', title: 'Perovskite Cells', abstract },
      user: dummyUser,
      entitlements,
    });

    assert.strictEqual(secondRun.cached, true);
    assert.strictEqual(secondRun.coverage, 'abstract_only');
  });

  await test('Quota enforcement: blocks generation when daily limit is reached and returns 429 quota payload', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const dummyUser = {
      _id: 'usr_mock_quota',
      dailySummaryUsage: { date: getDhakaDateString(new Date()), count: 3 },
      save: async () => {},
    };

    const entitlements = {
      plan: 'trial_v2',
      quotas: {
        canUsePaperSummarizer: true,
        dailySummaryGenerationLimit: 3,
      },
    };

    const blocked = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_new_unique_id_xyz',
        title: 'Beta Study',
        abstract: 'This is a different study with substantial abstract text for generation analysis.',
      },
      user: dummyUser,
      entitlements,
    });

    assert.strictEqual(blocked.quotaExceeded, true);
    assert.strictEqual(blocked.code, 'DAILY_SUMMARY_LIMIT_REACHED');
  });

  await test('Security guard: Free plan user receives FEATURE_LOCKED (403) and cannot read cached summary', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const dummyUser = {
      _id: 'usr_mock_free',
      dailySummaryUsage: { date: getDhakaDateString(new Date()), count: 0 },
      save: async () => {},
    };

    const entitlements = {
      plan: 'free',
      quotas: {
        canUsePaperSummarizer: false,
        dailySummaryGenerationLimit: 0,
      },
    };

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_solar_99',
        title: 'Perovskite Cells',
        abstract: 'This study examines perovskite photovoltaic durability under humid climatic conditions.',
      },
      user: dummyUser,
      entitlements,
    });

    assert.strictEqual(res.error, true);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.code, 'FEATURE_LOCKED');
    assert.strictEqual(res.feature, 'paper_summary');
  });

  await test('Security guard: Unauthenticated guest receives FEATURE_LOCKED (403)', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_guest_test',
        title: 'Quantum Optics',
        abstract: 'A very detailed abstract about quantum optics and photon entanglement properties in nonlinear media.',
      },
      user: null,
      entitlements: {
        plan: 'guest',
        quotas: {
          canUsePaperSummarizer: false,
          dailySummaryGenerationLimit: 0,
        },
      },
    });

    assert.strictEqual(res.error, true);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.code, 'FEATURE_LOCKED');
  });

  await test('Paid tier entitlement: Premium and Pro Max have unlimited daily summaries', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const dummyUser = {
      _id: 'usr_mock_premium',
      dailySummaryUsage: { date: getDhakaDateString(new Date()), count: 42 },
      save: async () => {},
    };

    const entitlements = {
      plan: 'premium_6m',
      quotas: {
        canUsePaperSummarizer: true,
        dailySummaryGenerationLimit: null,
      },
    };

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_unlimited_test',
        title: 'High Performance Neural Synthesis',
        abstract: 'This study examines neural synthesis architectures with extensive evaluation across multiple benchmark domains. Findings demonstrate sustained 99% accuracy across test splits.',
      },
      user: dummyUser,
      entitlements,
    });

    assert.strictEqual(res.enabled, true);
    assert.strictEqual(res.quotaExceeded, undefined);
    assert.ok(res.summary);
  });

  await test('Author limitation extraction: detects contrastive "however" and "challenges remain" markers accurately', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const abstract =
      'Perovskite solar cells (PSCs) have emerged as one of the most promising photovoltaic technologies. ' +
      'However, challenges regarding stability, toxicity, and commercial scalability remain. ' +
      'Machine learning offers powerful tools for accelerating material discovery and predicting device degradation under operating conditions. ' +
      'This review surveys computational pipelines and feature engineering techniques.';

    const dummyUser = {
      _id: 'usr_mock_lim_1',
      dailySummaryUsage: { date: getDhakaDateString(new Date()), count: 0 },
      save: async () => {},
    };

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_lim_contrastive',
        title: 'Machine Learning for Perovskite Solar Cells',
        abstract,
      },
      user: dummyUser,
      entitlements: {
        plan: 'trial_v2',
        quotas: { canUsePaperSummarizer: true, dailySummaryGenerationLimit: 3 },
      },
    });

    assert.strictEqual(res.enabled, true);
    assert.ok(res.summary.authorStatedLimitations.toLowerCase().includes('challenges'));
    assert.ok(res.summary.authorStatedLimitations.toLowerCase().includes('stability'));
    assert.ok(res.summary.cautiousInferredLimitations.length > 20);
  });

  await test('Contextual inferred limitations: generates substantive domain and sample bounds when author unstated in abstract', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const abstract =
      'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. ' +
      'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. ' +
      'Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable.';

    const dummyUser = {
      _id: 'usr_mock_lim_2',
      dailySummaryUsage: { date: getDhakaDateString(new Date()), count: 0 },
      save: async () => {},
    };

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_transformer_lim',
        title: 'Attention Is All You Need',
        abstract,
      },
      user: dummyUser,
      entitlements: {
        plan: 'trial_v2',
        quotas: { canUsePaperSummarizer: true, dailySummaryGenerationLimit: 3 },
      },
    });

    assert.strictEqual(res.enabled, true);
    assert.strictEqual(res.summary.authorStatedLimitations, 'None explicitly stated by the authors in the abstract text.');
    assert.ok(res.summary.cautiousInferredLimitations.includes('Evaluation Scope'));
    assert.ok(res.summary.cautiousInferredLimitations.includes('Methodological Assumptions'));
    assert.ok(res.summary.cautiousInferredLimitations.toLowerCase().includes('computational complexity'));
  });

  await test('Full-text limitation section extraction: pulls directly from verified fullTextSections', async () => {
    process.env.PAPER_SUMMARIZER_ENABLED = 'true';

    const abstract =
      'We present a neural architecture for audio processing evaluated on standard speech benchmarks with improved accuracy.';

    const dummyUser = {
      _id: 'usr_mock_lim_3',
      dailySummaryUsage: { date: getDhakaDateString(new Date()), count: 0 },
      save: async () => {},
    };

    const res = await getOrGeneratePaperSummary({
      paper: {
        id: 'paper_fulltext_lim',
        title: 'Audio Neural Architecture',
        abstract,
        fullTextExtracted: 'Full content...',
        fullTextSections: [
          { title: 'Introduction', content: 'Audio models are important.' },
          { title: 'Limitations', content: 'Our approach requires 8 A100 GPUs during training and exhibits latency degradation on noisy audio streams.' },
        ],
      },
      user: dummyUser,
      entitlements: {
        plan: 'premium_6m',
        quotas: { canUsePaperSummarizer: true, dailySummaryGenerationLimit: null, canAccessFullTextSummary: true },
      },
    });

    assert.strictEqual(res.enabled, true);
    assert.ok(res.summary.authorStatedLimitations.toLowerCase().includes('gpus'));
    assert.ok(res.summary.authorStatedLimitations.toLowerCase().includes('latency degradation'));
  });

  await test('SSRF protection: rejects loopback, RFC1918 private IPs, AWS/GCP metadata, and invalid protocols', () => {
    assert.strictEqual(isPrivateIpOrHost('localhost'), true);
    assert.strictEqual(isPrivateIpOrHost('127.0.0.1'), true);
    assert.strictEqual(isPrivateIpOrHost('10.0.0.1'), true);
    assert.strictEqual(isPrivateIpOrHost('192.168.1.1'), true);
    assert.strictEqual(isPrivateIpOrHost('169.254.169.254'), true);
    assert.strictEqual(isPrivateIpOrHost('metadata.google.internal'), true);
    assert.strictEqual(isPrivateIpOrHost('arxiv.org'), false);
    assert.strictEqual(isPrivateIpOrHost('zenodo.org'), false);

    assert.strictEqual(isValidHttpUrl('http://localhost:5000/steal'), false);
    assert.strictEqual(isValidHttpUrl('http://169.254.169.254/latest/meta-data'), false);
    assert.strictEqual(isValidHttpUrl('ftp://example.com/file.pdf'), false);
    assert.strictEqual(isValidHttpUrl('https://arxiv.org/pdf/2301.12345.pdf'), true);
  });

  await test('Dataset repository URL validation: accepts trusted repositories, rejects malicious protocols', () => {
    assert.strictEqual(isValidDatasetRepositoryUrl('https://zenodo.org/records/12345'), true);
    assert.strictEqual(isValidDatasetRepositoryUrl('https://doi.org/10.5281/zenodo.123'), true);
    assert.strictEqual(isValidDatasetRepositoryUrl('https://dataverse.harvard.edu/dataset'), true);
    assert.strictEqual(isValidDatasetRepositoryUrl('https://github.com/academic/research-dataset'), true);
    assert.strictEqual(isValidDatasetRepositoryUrl('javascript:alert(1)'), false);
    assert.strictEqual(isValidDatasetRepositoryUrl('http://127.0.0.1/datasets'), false);
  });

  console.log(`\nAll ${passed}/${total} Paper Summary & Security tests passed!\n`);
}

if (require.main === module) {
  runPaperSummaryTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runPaperSummaryTests };
