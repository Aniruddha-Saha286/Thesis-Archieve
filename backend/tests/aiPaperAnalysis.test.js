const assert = require('assert');
const { getAiPaperAnalysis, validateAnalysis, collectSources, resetForTests } = require('../services/aiPaperAnalysisService');
const { getOrGeneratePaperSummary } = require('../services/paperSummaryService');
const { getDhakaDateString } = require('../utils/dhakaDate');

async function runAiPaperAnalysisTests() {
  const previous = { enabled: process.env.PAPER_AI_ENABLED, key: process.env.OPENAI_API_KEY };
  const abstract = 'We trained a convolutional network on 1000 chest images. The model achieved 90 percent accuracy. Our study is limited to a single hospital.';
  const source = [{ id: 'abstract', label: 'Abstract', text: abstract }];
  const empty = () => ({ text: '', quote: '', sourceId: '' });
  const fixture = () => ({
    objective: empty(), methodology: { text: 'Convolutional network training.', quote: 'We trained a convolutional network on 1000 chest images.', sourceId: 'abstract' },
    dataset: empty(), findings: empty(), contributions: empty(),
    limitations: { text: 'One hospital limits the study setting.', quote: 'Our study is limited to a single hospital.', sourceId: 'abstract' },
    futureWork: empty(),
    researchDirections: [{ text: 'Test performance at other hospitals; this is a suggestion, not a proven novel gap.', quote: 'Our study is limited to a single hospital.', sourceId: 'abstract' }],
  });
  const entitlements = { plan: 'premium', quotas: { canUsePaperSummarizer: true, dailySummaryGenerationLimit: 5, canAccessFullTextSummary: false } };
  let n = 0;
  const user = () => ({ _id: 'ai-test-' + (++n), dailySummaryUsage: { date: getDhakaDateString(), count: 0 }, save: async () => {} });
  const paper = { title: 'Chest network', abstract };
  try {
    process.env.PAPER_AI_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'mock-only-key';
    resetForTests();
    const accepted = validateAnalysis(fixture(), source);
    assert(accepted.found.methodology && accepted.found.limitations);
    assert.strictEqual(accepted.researchDirections.length, 1);
    const invalid = fixture();
    invalid.limitations.quote = 'This quotation does not occur in the source material.';
    const rejected = validateAnalysis(invalid, source);
    assert.strictEqual(rejected.found.limitations, false);
    invalid.methodology.sourceId = 'unseen-page';
    assert.throws(() => validateAnalysis({ ...invalid, researchDirections: [] }, source), /supported/);
    assert.throws(() => validateAnalysis({}, source), /field/);
    let calls = 0;
    const fetchImpl = async (url, options) => {
      calls++;
      assert.strictEqual(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(options.body);
      assert.strictEqual(body.store, false);
      assert.strictEqual(body.text.format.strict, true);
      assert(body.instructions.includes('untrusted'));
      return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(fixture()) }] }] }) };
    };
    const member = user();
    const first = await getAiPaperAnalysis({ paper, user: member, entitlements }, { fetchImpl });
    assert(first.summary.isAiGenerated);
    assert.strictEqual(member.dailySummaryUsage.count, 1);
    const again = await getAiPaperAnalysis({ paper, user: member, entitlements }, { fetchImpl });
    assert(again.cached);
    assert.strictEqual(calls, 1);
    assert.strictEqual(member.dailySummaryUsage.count, 1);
    resetForTests();
    const concurrentUsers = [user(), user()];
    const concurrent = await Promise.all(concurrentUsers.map((u) => getAiPaperAnalysis({ paper, user: u, entitlements }, {
      fetchImpl: async (...args) => { await new Promise((r) => setTimeout(r, 5)); return fetchImpl(...args); },
    })));
    assert(concurrent.every((r) => r.summary));
    assert.strictEqual(calls, 2, 'Concurrent requests must share one AI call');
    resetForTests();
    const failedMember = user();
    const failed = await getAiPaperAnalysis({ paper, user: failedMember, entitlements }, { fetchImpl: async () => { throw new Error('offline'); } });
    assert.strictEqual(failed.code, 'AI_ANALYSIS_FAILED');
    assert.strictEqual(failedMember.dailySummaryUsage.count, 0, 'Failures refund quota');
    const limited = user();
    limited.dailySummaryUsage.count = 5;
    const exceeded = await getAiPaperAnalysis({ paper, user: limited, entitlements }, { fetchImpl });
    assert(exceeded.quotaExceeded);
    assert.strictEqual(calls, 2);
    const free = await getAiPaperAnalysis({ paper, user: user(), entitlements: { ...entitlements, plan: 'free' } }, { fetchImpl });
    assert.strictEqual(free.code, 'FEATURE_LOCKED');
    const safe = await collectSources({ ...paper, fullTextExtracted: 'Forged client text' }, entitlements, async () => { throw new Error('PDF must not be fetched'); });
    assert.strictEqual(safe.sources.length, 1);
    let pdfReads = 0;
    const full = await collectSources({ ...paper, pdfUrl: 'https://example.org/a.pdf' }, {
      ...entitlements, quotas: { ...entitlements.quotas, canAccessFullTextSummary: true },
    }, async () => {
      pdfReads++;
      return { ok: true, pageCount: 4, pagesRead: 4, analysisSources: [{ title: 'Methods', startPage: 2, endPage: 2, text: abstract }] };
    });
    assert.strictEqual(pdfReads, 1);
    assert.strictEqual(full.coverage, 'full_text');
    assert(full.coverageNote.includes('Selected PDF excerpts'));
    process.env.PAPER_AI_ENABLED = 'false';
    const disabled = await getOrGeneratePaperSummary({ paper, user: user(), entitlements, analysisMode: 'ai' });
    assert.strictEqual(disabled.code, 'AI_NOT_CONFIGURED');
    assert.strictEqual(calls, 2);
    console.log('AI paper analysis: grounding, caching, concurrent reuse, quota refunds, entitlement and PDF-source checks passed.');
  } finally {
    resetForTests();
    for (const [env, value] of [['PAPER_AI_ENABLED', previous.enabled], ['OPENAI_API_KEY', previous.key]]) {
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
  }
}
module.exports = { runAiPaperAnalysisTests };
