const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { queryMatch } = require('../services/queryRelevance');
const datasets = require('../services/datasetDiscoveryService');
const { executeSearchSession } = require('../services/searchSessionManager');
const { callModel } = require('../services/aiPaperAnalysisService');

async function runRetrievalRelevanceTests() {
  const previousFetch = global.fetch;
  const previousOffline = process.env.OFFLINE_MODE;
  const ok = (data) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data });
  try {
    assert(!queryMatch({ title: 'Painting restoration training' }, 'AI').accepted, 'Substring ai is not an AI match');
    assert(queryMatch({ title: 'Artificial intelligence for crop diseases' }, 'AI crop disease').accepted);
    assert(queryMatch({ title: 'Bengali sentiment classification' }, 'Bangla sentiment analysis').accepted);
    assert(queryMatch({ title: 'Diseases of leaves', abstract: 'Crop leaf images.' }, 'crop disease leaf images').accepted);
    assert(!queryMatch({ title: 'Age bias training data' }, 'Bangla sentiment analysis').accepted);
    assert(!queryMatch({ title: 'Deep learning for healthcare' }, 'crop disease leaf images').accepted);
    assert(queryMatch({ title: 'Fine grained leaf disease images' }, 'leaf disease').accepted);
    assert(queryMatch({ doi: '10.5555/test', title: 'No query terms here' }, 'https://doi.org/10.5555/test').accepted);
    assert(!queryMatch({ doi: '10.5555/wrong' }, '10.5555/test').accepted);
    process.env.OFFLINE_MODE = 'false';
    datasets.resetDatasetCacheForTests();
    const dcItem = (id, title, type = 'Dataset') => ({
      id, attributes: { doi: id, titles: [{ title }], url: 'https://doi.org/' + id, types: { resourceTypeGeneral: type } },
    });
    global.fetch = async (url) => {
      const address = String(url);
      if (address.includes('api.datacite.org')) return ok({ data: [
        dcItem('10.5555/bangla-good', 'Bangla sentiment corpus'),
        dcItem('10.5555/age-unrelated', 'Age bias training data'),
        dcItem('10.5555/wrong-type', 'Bangla sentiment analysis paper', 'Text'),
      ], meta: { total: 3 } });
      if (address.includes('zenodo.org/api')) return ok({ hits: { total: 1, hits: [
        { id: 123, metadata: { title: 'Bangla sentiment slides', resource_type: { type: 'publication' } } },
      ] } });
      if (address.includes('api.figshare.com')) return ok([
        { id: 1, title: 'Bangla sentiment figure', defined_type: 1, defined_type_name: 'figure' },
      ]);
      if (address.includes('datadryad')) return ok({ total: 0, _embedded: { 'stash:datasets': [] } });
      if (address.includes('dataverse')) return ok({ status: 'OK', data: { total_count: 0, items: [] } });
      if (address.includes('huggingface')) return ok([]);
      throw new Error('Unexpected provider');
    };
    const found = await datasets.searchGlobalDatasets({ query: 'Bangla sentiment analysis', limit: 10 });
    assert.deepStrictEqual(found.datasets.map(d => d.doi), ['10.5555/bangla-good']);
    assert.deepStrictEqual(found.datasets[0].queryMatch.matchedTerms, ['bangla', 'sentiment']);
    const papers = [
      { DOI: '10.5555/quantum', title: ['Quantum computing algorithms'], type: 'journal-article', published: { 'date-parts': [[2024]] } },
      { DOI: '10.5555/off-topic', title: ['Computing for hospital management'], type: 'journal-article', published: { 'date-parts': [[2024]] } },
    ];
    global.fetch = async () => ok({ message: { items: papers, 'total-results': 2 } });
    const search = await executeSearchSession({
      query: 'quantum computing', limit: 10, filters: { source: 'Crossref' },
      explicitSessionId: 'relevance_test_' + Date.now(),
    });
    assert.deepStrictEqual(search.records.map(r => r.doi), ['10.5555/quantum']);
    const { analyzeTopic, universityMatchesRecord, recordUniversity, buildBriefText } = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/topicAnalysis.js')).href);
    const institution = { id: 'I123', name: 'Example University', aliases: ['EU'] };
    const paper = { id: 'paper1', title: 'Crop disease detection', publicationType: 'journal-article',
      authorships: [{ institutions: [{ id: 'I123', name: 'Example University' }] }] };
    const thesis = { id: 'thesis1', title: 'Crop disease detection', publicationType: 'thesis',
      awardingInstitution: { name: 'Example University', id: 'I123' } };
    const affiliationOnly = { id: 'thesis2', title: 'Crop disease detection', publicationType: 'thesis',
      university: 'Example University', authorships: paper.authorships };
    assert(universityMatchesRecord(paper, institution));
    assert(universityMatchesRecord(thesis, institution, true));
    assert(!universityMatchesRecord(affiliationOnly, institution, true), 'Affiliation does not prove degree-awarding institution');
    assert.strictEqual(recordUniversity(affiliationOnly), '');
    assert(!universityMatchesRecord({ ...paper, authorships: [{ institutions: [{ name: 'Example University International' }] }] }, institution));
    const report = analyzeTopic({ topic: 'crop disease detection', records: [paper, affiliationOnly], thesisRecords: [thesis], universityInstitution: institution });
    assert.strictEqual(report.sameUniversity.length, 1);
    assert.strictEqual(report.universityMatches.length, 3);
    assert(buildBriefText(report).includes('Matched work at Example University'));
    const merged = analyzeTopic({ topic: 'crop disease detection', records: [{ ...paper, doi: '10.5555/same', authorships: [] }, { ...paper, doi: '10.5555/same' }], universityInstitution: institution });
    assert.strictEqual(merged.items.length, 1);
    assert.strictEqual(merged.universityMatches.length, 1, 'University-specific evidence survives duplicate records');
    await assert.rejects(callModel([{ id: 'a', label: 'Abstract', text: 'A supplied verification excerpt.' }], 'en', 'gpt-4o-mini',
      async () => ({ ok: false, json: async () => ({ error: { code: 'credit_balance_exhausted', type: 'insufficient_quota' } }) })),
      error => error.code === 'AI_BILLING_UNAVAILABLE');
    console.log('Search relevance and university matching checks passed: off-topic results, wrong dataset types, aliases, DOI matching, affiliations and duplicate evidence.');
  } finally {
    global.fetch = previousFetch;
    if (previousOffline === undefined) delete process.env.OFFLINE_MODE; else process.env.OFFLINE_MODE = previousOffline;
    datasets.resetDatasetCacheForTests();
  }
}
module.exports = { runRetrievalRelevanceTests };
