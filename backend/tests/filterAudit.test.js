const assert = require('assert');
const mongoose = require('mongoose');
const Thesis = require('../models/Thesis');
const { parseAndValidateThesisQuery } = require('../services/queryParser');
const { hasDirectPdf, matchesResources } = require('../services/resourceLinks');
const { publisherPatterns } = require('../services/publisherFilters');

async function runFilterAuditTests() {
  const { matchesInstitutionalAndAuthorFilters: matchesAffiliations } = require('../services/searchSessionManager');
  const splitAffiliations = { authorships: [
    { author: { id: 'A123' }, institutions: [{ id: 'I123', countryCode: 'US' }, { id: 'I124', countryCode: 'BD' }] },
    { author: { id: 'A124' }, institutions: [{ id: 'I123', countryCode: 'BD' }] },
  ], awardingInstitution: { id: 'I999', name: 'Awarding University', countryCode: 'GB' } };
  assert(!matchesAffiliations(splitAffiliations, { authorId: 'A123', institutionId: 'I123', countryCodes: 'BD' }), 'Author, institution and country must match the same affiliation');
  assert(matchesAffiliations(splitAffiliations, { authorId: 'A123', institutionId: 'I999', institutionMode: 'awarding', countryCodes: 'GB' }), 'Awarding institution must not require an author affiliation at that university');
  assert(!matchesResources({ degreeType: 'Obscure manuscript' }, { degree: 'bsc' }), 'Degree abbreviations must be whole words');
  for (const [degree, values] of Object.entries({ bsc: ['B.Sc. Thesis', 'Bachelor of Science', 'Final-year project'], msc: ['M.Sc.', 'Masters thesis'], phd: ['Ph.D.', 'Doctoral dissertation'] })) {
    for (const degreeType of values) assert(matchesResources({ degreeType }, { degree }), degreeType);
  }
  for (const raw of [{ countryCodes: { $ne: 'BD' } }, { countryCode: 12 }, { countries: [{ value: 'BD' }] }]) assert.strictEqual(parseAndValidateThesisQuery(raw).valid, false, 'Malformed country filters must not be silently ignored');
  for (const raw of [{ page: '2junk' }, { page: '2.5' }, { minCitations: '50junk' }, { minCitations: '1.5' }, { hasPdf: 'yes' }, { isOpenAccess: 'anything' }, { hasCode: 'yes' }, { yearMin: '2025', yearMax: '2020' }, { degree: ['msc'] }, { institutionId: { $ne: '' } }, { program: 'invalid' }]) assert.strictEqual(parseAndValidateThesisQuery(raw).valid, false, JSON.stringify(raw));
  for (const raw of [{ hasPdf: 'false' }, { isOpenAccess: 'true' }, { minCitations: '50' }, { countryCodes: ['bd', 'US'] }, { yearMin: '2020', yearMax: '2026' }]) assert.strictEqual(parseAndValidateThesisQuery(raw).valid, true);
  assert(!hasDirectPdf({ isDirectPdf: true, pdfUrl: null }));
  assert(!hasDirectPdf({ pdfUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123/' }));
  assert(!hasDirectPdf({ pdfUrl: 'javascript:alert(1)', isDirectPdf: true }));
  assert(hasDirectPdf({ pdfUrl: 'https://example.org/paper.pdf?download=1' }));
  assert(hasDirectPdf({ fullTextLocations: [{ type: 'pdf', url: 'https://arxiv.org/pdf/2601.12345' }] }));
  assert(publisherPatterns('IEEE').some(pattern => pattern.test('Institute of Electrical and Electronics Engineers')));
  assert(!matchesResources({ datasetUrl: 'https://zenodo.org/records/1' }, { hasOpenDataset: true }));

  // Test the actual session pipeline, with provider transport replaced by fixtures.
  // Each negative record differs in a selected field; missing metadata must also fail.
  const providerList = [
    ['local', 'searchLocal'], ['openalex', 'searchOpenAlex'], ['arxiv', 'searchArxiv'], ['crossref', 'searchCrossref'],
    ['europePmc', 'searchEuropePmc'], ['hal', 'searchHal'], ['doaj', 'searchDoaj'], ['semanticScholar', 'searchSemanticScholar'],
    ['openaire', 'searchOpenAire'], ['core', 'searchCore'], ['dblp', 'searchDblp'],
  ];
  let batch = [];
  const originals = providerList.map(([file, name]) => {
    const path = require.resolve('../services/providers/' + file), previous = require.cache[path];
    require.cache[path] = { id: path, filename: path, loaded: true, exports: { ...previous?.exports, [name]: async () => ({ records: structuredClone(batch), rawCount: batch.length, hasMore: false }) } };
    return { path, previous };
  });
  const managerPath = require.resolve('../services/searchSessionManager'), oldManager = require.cache[managerPath];
  const previousMode = process.env.NODE_ENV; process.env.NODE_ENV = 'test'; delete require.cache[managerPath];
  const manager = require('../services/searchSessionManager');
  const base = () => ({ id: 'positive', title: 'Coastal baseline evidence', publicationType: 'thesis', degreeType: 'M.Sc.', department: 'Computer Science',
    publishedYear: 2025, citationCount: 75, publisher: 'Institute of Electrical and Electronics Engineers', venue: 'CVPR',
    isOpenAccess: true, pdfUrl: 'https://example.org/paper.pdf', isDirectPdf: true, codeUrl: 'https://github.com/fixture/coast', datasetUrl: 'https://zenodo.org/records/1', isOpenDataset: true,
    subjects: [{ id: 'ai-ml', fieldId: '17' }], fieldId: '17', authorships: [{ author: { id: 'A123', name: 'Fixture Author' }, institutions: [{ id: 'I123', name: 'Fixture University', countryCode: 'BD' }] }],
    awardingInstitution: { id: 'I123', name: 'Fixture University', countryCode: 'BD' }, source: 'Local Archive' });
  const cases = [
    [{ publicationType: 'thesis' }, { publicationType: 'journal-article' }, { publicationType: null }],
    [{ yearMin: '2024', yearMax: '2026' }, { publishedYear: 2020 }, { publishedYear: null }],
    [{ isOpenAccess: true }, { isOpenAccess: false }, { isOpenAccess: null }],
    [{ hasPdf: true }, { pdfUrl: null, isDirectPdf: true }, { pdfUrl: null, isDirectPdf: false }],
    [{ hasCode: true }, { codeUrl: 'https://example.org/blog' }, { codeUrl: null }],
    [{ hasOpenDataset: true }, { isOpenDataset: false }, { datasetUrl: null }],
    [{ degree: 'msc' }, { degreeType: 'B.Sc.' }, { degreeType: null }],
    [{ program: 'cse' }, { department: 'Electrical Engineering' }, { department: null }],
    [{ venue: 'cvpr' }, { venue: 'CVPR Workshops' }, { venue: null }],
    [{ publisher: 'IEEE' }, { publisher: 'Elsevier' }, { publisher: null }],
    [{ minCitations: 50 }, { citationCount: 3 }, { citationCount: null }],
    [{ subjectId: 'ai-ml' }, { subjects: [{ id: 'pharmacy' }], category: 'Other' }, { subjects: [] }],
    [{ fieldId: '17' }, { fieldId: '27', subjects: [{ fieldId: '27' }] }, { fieldId: null, subjects: [] }],
    [{ institutionId: 'I123' }, { authorships: [], university: 'Different University', awardingInstitution: null }, { authorships: [], awardingInstitution: null }],
    [{ countryCodes: 'BD' }, { authorships: [{ author: { id: 'A123' }, institutions: [{ id: 'I124', countryCode: 'US' }] }], awardingInstitution: null }, { authorships: [], awardingInstitution: null }],
    [{ authorId: 'A123' }, { authorships: [{ author: { id: 'A124' }, institutions: [] }] }, { authorships: [] }],
    [{ institutionId: 'I123', institutionMode: 'awarding' }, { awardingInstitution: { id: 'I124', name: 'Other University' } }, { awardingInstitution: null }],
  ];
  try {
    let index = 0;
    for (const [filters, negative, missing] of cases) {
      batch = [base(), { ...base(), ...negative, id: 'negative', title: 'Coastal conflicting metadata' }, { ...base(), ...missing, id: 'unknown', title: 'Coastal missing metadata' }];
      const result = await manager.executeSearchSession({ query: 'coastal', page: 1, limit: 5, filters: { source: 'local', ...filters }, scope: `filter-audit-${index++}-${Date.now()}` });
      assert.deepStrictEqual(result.records.map(record => record.id), ['positive'], JSON.stringify(filters));
    }
    batch = [base(), { ...base(), id: 'coauthor', title: 'Coastal coauthor affiliation', authorships: [{ author: { id: 'A123' }, institutions: [{ id: 'I124', countryCode: 'US' }] }, { author: { id: 'A124' }, institutions: [{ id: 'I123', countryCode: 'BD' }] }] }];
    const combined = await manager.executeSearchSession({ query: 'coastal', limit: 5, scope: 'filter-conjunction-' + Date.now(), filters: { source: 'local', authorId: 'A123', institutionId: 'I123', countryCodes: 'BD', hasPdf: true, hasCode: true, hasOpenDataset: true, degree: 'msc', program: 'cse', minCitations: 50, yearMin: '2024', yearMax: '2026', publicationType: 'thesis', subjectId: 'ai-ml', fieldId: '17', publisher: 'IEEE', venue: 'cvpr', isOpenAccess: true } });
    assert.deepStrictEqual(combined.records.map(record => record.id), ['positive']);
    for (const publicationType of ['thesis', 'journal-article', 'conference-paper', 'preprint', 'book']) {
      batch = [{ ...base(), publicationType }, { ...base(), id: 'other-type', publicationType: 'dataset' }];
      const result = await manager.executeSearchSession({ query: 'coastal', limit: 5, scope: `filter-type-${publicationType}-${Date.now()}`, filters: { source: 'local', publicationType } });
      assert.deepStrictEqual(result.records.map(record => record.id), ['positive'], publicationType);
    }
    batch = [{ ...base(), id: 'older', title: 'Coastal erosion benchmark dataset study', citationCount: 900, publishedYear: 2020 }, { ...base(), id: 'newer', title: 'Coastal satellite image classification methods', citationCount: 100, publishedYear: 2026 }, { ...base(), id: 'pinned', title: 'Coastal sediment transport observations', citationCount: 5, publishedYear: 2015, isPinned: true }];
    for (const [sort, expected] of [['citations', ['older', 'newer', 'pinned']], ['newest', ['newer', 'older', 'pinned']]]) {
      const result = await manager.executeSearchSession({ query: 'coastal', limit: 5, sort, scope: `filter-sort-${sort}-${Date.now()}`, filters: { source: 'local' } });
      assert.deepStrictEqual(result.records.map(record => record.id), expected, sort);
    }
  } finally {
    originals.forEach(({ path, previous }) => { if (previous) require.cache[path] = previous; else delete require.cache[path]; });
    if (oldManager) require.cache[managerPath] = oldManager; else delete require.cache[managerPath];
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  }

  // The local query must narrow records before skip/limit, not only afterwards.
  const { searchLocal } = require('../services/providers/local');
  const originalsLocal = { find: Thesis.find, count: Thesis.countDocuments, state: mongoose.connection.readyState };
  let captured, capturedSort, localDocs = [];
  mongoose.connection.readyState = 1;
  Thesis.countDocuments = async filter => { captured = filter; return 0; };
  Thesis.find = () => ({ sort(value) { capturedSort = value; return this; }, skip() { return this; }, limit() { return this; }, lean: async () => localDocs });
  try {
    await searchLocal({ filters: { publisher: 'IEEE', degree: 'msc', program: 'cse', hasCode: true, hasOpenDataset: true, minCitations: 50 } });
    assert(captured.$and.some(clause => clause.degreeType?.test('M.Sc.')));
    assert(captured.$and.some(clause => clause.department?.test('Computer Science')));
    assert(captured.$and.some(clause => clause.isOpenDataset === true));
    assert(captured.$and.some(clause => clause.$or?.some(item => item.publisher?.test('Institute of Electrical and Electronics Engineers'))));
    await searchLocal({ sort: 'citations' });
    assert.deepStrictEqual(capturedSort, { 'citationMetrics.count': -1, createdAt: -1 });
    localDocs = [{ _id: 'local-journal', title: 'Coastal article', author: 'Author', publicationType: 'journal-article', degreeType: 'M.Sc. Thesis', category: 'Custom discipline', university: 'Fixture University', isOpenAccess: null }];
    const normalized = (await searchLocal({})).records[0];
    assert.strictEqual(normalized.publicationType, 'journal-article', 'A default degree label must not replace an explicit publication type');
    assert.strictEqual(normalized.isOpenAccess, false, 'Unknown open-access status must not become verified open access');
    assert.strictEqual(normalized.category, 'Custom discipline', 'Local discipline metadata must survive normalization');
  } finally { Thesis.find = originalsLocal.find; Thesis.countDocuments = originalsLocal.count; mongoose.connection.readyState = originalsLocal.state; }
  const oldFetch = global.fetch, oldOffline = process.env.OFFLINE_MODE;
  const institutions = require('../services/institutionService'), oldSuggest = institutions.suggestInstitutions;
  try {
    process.env.OFFLINE_MODE = 'false';
    institutions.suggestInstitutions = async () => [{ id: 'I123', name: 'Fixture University' }];
    let upstream;
    global.fetch = async url => {
      upstream = new URL(url);
      return { ok: true, status: 200, json: async () => ({ meta: { count: 1 }, results: [{ id: 'https://openalex.org/W123', title: 'Coastal PDF study', type: 'article', has_fulltext: false, primary_location: { pdf_url: 'https://example.org/coast.pdf' }, open_access: { is_oa: true } }] }) };
    };
    const { searchOpenAlex } = require('../services/providers/openalex');
    const linked = await searchOpenAlex({ query: 'coastal', filters: { hasPdf: true, institutionName: 'Fixture University', yearMin: '2020', minCitations: 50, publicationType: 'journal-article' } });
    const sent = upstream.searchParams.get('filter');
    assert(sent.includes('institutions.id:I123'), 'Name-only university shortcuts must narrow the upstream search');
    for (const filter of ['from_publication_date:2020-01-01', 'cited_by_count:>49', 'type:article']) assert(sent.includes(filter), filter);
    assert(!sent.includes('has_fulltext'), 'A linked PDF does not require searchable full text');
    assert(hasDirectPdf(linked.records[0]));
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ meta: { count: 1 }, results: [{ id: 'https://openalex.org/W124', title: 'Repository PDF', locations: [{ pdf_url: 'https://example.org/download?id=124' }] }] }) });
    const repositoryPdf = await searchOpenAlex({ filters: { hasPdf: true } });
    assert.strictEqual(repositoryPdf.records[0].pdfUrl, 'https://example.org/download?id=124', 'Explicit PDF metadata in alternate locations must be recognized');
    global.fetch = async url => { upstream = new URL(url); return { ok: true, status: 200, json: async () => ({ results: [] }) }; };
    await searchOpenAlex({ filters: { isOpenAccess: true } });
    assert(upstream.searchParams.get('filter').includes('is_oa:true'));
  } finally {
    global.fetch = oldFetch; institutions.suggestInstitutions = oldSuggest;
    if (oldOffline === undefined) delete process.env.OFFLINE_MODE; else process.env.OFFLINE_MODE = oldOffline;
  }
  console.log('Strict filter audit: 17 pipeline filters, unknown metadata exclusion, combined author/institution/country constraints, PDF evidence, request validation and local pre-pagination narrowing passed.');
}
module.exports = { runFilterAuditTests };
if (require.main === module) runFilterAuditTests().catch(error => { console.error(error); process.exitCode = 1; });
