const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { ResearchCache } = require('../services/researchCache');
const { resources, matchesResources } = require('../services/resourceLinks');
const { parseAndValidateThesisQuery } = require('../services/queryParser');
const { computeSessionHash } = require('../services/searchSessionManager');
const { matrixRow, publicCollection } = require('../services/literatureMatrix');
const { neighborhood, seedIdentifier, cache: citationCache } = require('../services/citationNeighborhood');
function request(port, method, route, body, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, res => {
      let raw = ''; res.on('data', c => { raw += c; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function runResearchFeaturesTests() {
  let now = 0, calls = 0;
  const cache = new ResearchCache({ ttl: 100, maxEntries: 2, maxBytes: 1000, now: () => now });
  const loader = async () => { calls++; return { records: [{ title: 'Original' }] }; };
  const [one, two] = await Promise.all([cache.get('same', loader), cache.get('same', loader)]);
  assert.equal(calls, 1); one.records[0].title = 'Changed'; assert.equal(two.records[0].title, 'Original');
  assert.equal((await cache.get('same', loader)).records[0].title, 'Original');
  now = 101; await cache.get('same', loader); assert.equal(calls, 2);
  await cache.get('b', loader); await cache.get('c', loader); assert.equal(cache.entries.size, 2);
  await assert.rejects(cache.get('error', async () => { throw new Error('outage'); }));
  await cache.get('error', loader); assert.equal(cache.pending.size, 0);
  await cache.get('partial', async () => ({ partialResults: true })); assert(!cache.entries.has('partial'));
  assert(!resources({ codeUrl: 'https://github.com.evil.example/project', datasetUrl: 'javascript:alert(1)' }).code);
  assert(!resources({ codeUrl: 'https://user:password@github.com/project' }).code);
  assert(matchesResources({ codeUrl: 'https://github.com/team/code', datasetUrl: 'https://zenodo.org/records/1', degreeType: 'B.Sc. Thesis', department: 'Computer Science' }, { hasCode: true, hasDataset: true, degree: 'bsc', program: 'cse' }));
  assert(!matchesResources({ degreeType: 'B.Sc. Thesis' }, { program: 'cse' }));
  assert(!matchesResources({ datasetUrl: 'https://zenodo.org/records/1' }, { hasOpenDataset: true }), 'A repository link alone does not prove open access');
  assert(matchesResources({ datasetUrl: 'https://zenodo.org/records/1', isOpenDataset: true }, { hasOpenDataset: true }));
  assert(!parseAndValidateThesisQuery({ hasCode: 'maybe' }).valid);
  assert(!parseAndValidateThesisQuery({ degree: 'madeup' }).valid);
  assert(!parseAndValidateThesisQuery({ program: 'madeup' }).valid);
  assert(parseAndValidateThesisQuery({ hasOpenDataset: 'true', program: 'eee' }).isSearchInquiry);
  assert.notEqual(computeSessionHash('topic', {}), computeSessionHash('topic', { hasCode: true }));
  assert.notEqual(computeSessionHash('topic', { hasDataset: true }), computeSessionHash('topic', { hasOpenDataset: true }));
  const row = matrixRow({ title: 'Title', abstract: 'This is not a methodology.', structuredNotes: { method: 'Personal method note' } }, { coverage: 'abstract_only', summary: { methodology: 'Cached method', evidence: [{ field: 'methodology', quote: 'Exact quote', sectionOrPage: 'p. 3' }] } });
  assert.equal(row.methodology, 'Personal method note'); assert.equal(row.findings, 'Not extracted'); assert(row.evidence.includes('p. 3'));
  assert.equal(matrixRow({ abstract: 'No guess allowed' }).methodology, 'Not extracted');
  const shared = publicCollection({ name: 'Reading list', paperIds: ['one'] }, [{ paperId: 'one', title: 'Paper', notes: 'PRIVATE', structuredNotes: { method: 'PRIVATE' }, doi: '10.5555/example' }]);
  assert(!JSON.stringify(shared).includes('PRIVATE')); assert.equal(shared.papers.length, 1);
  const utils = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/literatureExport.js')).href);
  assert(utils.csvCell(' =HYPERLINK("evil")').startsWith('"\'')); assert.equal(utils.csvCell('a,"b"'), '"a,""b"""');
  assert(utils.matrixCsv([{ title: 'বাংলা গবেষণা' }]).includes('বাংলা গবেষণা'));
  assert(utils.matrixMarkdown([{ title: '<script>|a\nb' }]).includes('&lt;script&gt;\\|a<br>b'));
  const buffer = await utils.matrixExcel([{ title: '=1+1', methodology: 'A "quote"\nand newline', year: 2025 }]);
  const ExcelJS = require('../../frontend/node_modules/exceljs'); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets[0].getCell('A2').value, '=1+1'); assert.equal(workbook.worksheets[0].getCell('G2').value, 'A "quote"\nand newline');
  const urlUtils = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/urlState.js')).href);
  assert.equal(urlUtils.parseUrlState(urlUtils.buildUrl({ code: true, data: true, degree: 'msc', program: 'eee' })).program, 'eee');
  const offline = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/offlineLibrary.js')).href);
  const values = new Map(); const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), key: i => [...values.keys()][i], get length() { return values.size; } };
  storage.setItem('thesis_vault_token', 'test-session-one'); await offline.cacheOfflineSession(storage, { id: 'one', status: 'approved', role: 'student' });
  assert.equal((await offline.offlineSession(storage)).id, 'one');
  storage.setItem('thesis_vault_token', 'different-session'); assert.equal(await offline.offlineSession(storage), null);
  offline.cacheOfflineLibrary(storage, 'one', [{ title: 'Own library' }]); assert.equal(offline.offlineLibrary(storage, 'two'), null);
  offline.clearOfflineData(storage); assert.equal(offline.offlineLibrary(storage, 'one'), null); assert.equal(storage.getItem('thesis_vault_token'), 'different-session');
  assert.equal(seedIdentifier({ id: 'openalex_W123' }).id, 'W123'); assert.equal(seedIdentifier({ doi: 'http://localhost/internal' }), null);
  citationCache.clear(); let graphCalls = 0;
  const graph = await neighborhood({ id: 'W123' }, async url => {
    graphCalls++; return { ok: true, json: async () => url.includes('/works/W123') ? { id: 'https://openalex.org/W123', display_name: 'Seed', referenced_works: ['https://openalex.org/W1'], related_works: ['https://openalex.org/W2'] } : { results: [{ id: 'https://openalex.org/W3', display_name: 'Neighbor', doi: 'https://doi.org/10.5555/neighbor' }] } };
  }); assert.equal(graph.references.length, 1); assert.equal(graph.citations.length, 1); assert.equal(graph.similar.length, 1); assert.equal(graphCalls, 4);
  await neighborhood({ id: 'W123' }, () => { throw new Error('cache missed'); }); citationCache.clear();
  await runSharingRouteTests();
  console.log('Research tools: cache isolation/expiry, resource filters, export escaping/XLSX, citation relationships, offline account separation and sharing ownership/revocation passed.');
}
async function runSharingRouteTests() {
  const User = require('../models/User'); const Thesis = require('../models/Thesis');
  const entitlement = require('../services/entitlementService'); const PaperSummary = require('../models/PaperSummary');
  const original = { findById: User.findById, findOne: User.findOne, updateOne: User.updateOne, thesisFind: Thesis.find, aggregate: Thesis.aggregate, entitlement: entitlement.getEffectiveEntitlements, summaryFind: PaperSummary.find, secret: process.env.JWT_SECRET };
  const routePath = require.resolve('../routes/research'); const originalRoute = require.cache[routePath];
  const owner = new User({ _id: '111111111111111111111111', name: 'Owner', email: 'private@example.org', status: 'approved', savedPapers: [{ paperId: 'paper-one', title: 'Public title', notes: 'SECRET NOTE' }], collections: [{ _id: '333333333333333333333333', name: 'Public list', description: 'Public description', paperIds: ['paper-one'] }] });
  const other = new User({ _id: '222222222222222222222222', name: 'Other', email: 'other@example.org', status: 'approved', collections: [] });
  let server;
  try {
    process.env.JWT_SECRET = 'research-feature-test-secret';
    User.findById = id => ({ select: async () => String(id) === String(owner._id) ? owner : other });
    User.findOne = query => ({ select: async () => owner.collections[0].shareToken === query['collections.shareToken'] ? owner : null });
    User.updateOne = async (query, update) => { assert.equal(String(query._id), String(owner._id)); if (update.$set) owner.collections[0].shareToken = update.$set['collections.$.shareToken']; else owner.collections[0].shareToken = undefined; return { matchedCount: 1 }; };
    entitlement.getEffectiveEntitlements = async () => ({ plan: 'free', quotas: { canUsePaperSummarizer: false } });
    PaperSummary.find = () => { throw new Error('Free accounts must not receive premium cached analysis'); };
    Thesis.find = query => { assert.equal(query.status, 'approved'); return { select: () => ({ limit: () => ({ lean: async () => [{ title: 'Approved title' }] }) }) }; };
    Thesis.aggregate = async pipeline => { assert.equal(pipeline[0].$match.status, 'approved'); return []; };
    delete require.cache[routePath]; const app = express(); app.use(express.json()); app.use('/api/research', require('../routes/research'));
    server = app.listen(0); await new Promise(resolve => server.once('listening', resolve)); const port = server.address().port;
    const token = jwt.sign({ id: String(owner._id) }, process.env.JWT_SECRET); const otherToken = jwt.sign({ id: String(other._id) }, process.env.JWT_SECRET);
    const sharePath = '/api/research/collections/333333333333333333333333/share';
    assert.equal((await request(port, 'POST', sharePath)).status, 401);
    assert.equal((await request(port, 'POST', sharePath, undefined, otherToken)).status, 404);
    const enabled = await request(port, 'POST', sharePath, undefined, token); assert.equal(enabled.status, 200); assert(/^[a-f0-9]{48}$/.test(enabled.body.token));
    const publicPath = '/api/research/shared/' + enabled.body.token;
    const view = await request(port, 'GET', publicPath); assert.equal(view.status, 200); assert(!JSON.stringify(view.body).includes('SECRET')); assert(!JSON.stringify(view.body).includes('private@example'));
    assert.equal((await request(port, 'DELETE', sharePath, undefined, token)).status, 200); assert.equal((await request(port, 'GET', publicPath)).status, 404);
    const matrix = await request(port, 'POST', '/api/research/matrix', { papers: [{ paperId: 'paper-one' }] }, token);
    assert.equal(matrix.status, 200); assert.equal(matrix.body.rows[0].notes, 'SECRET NOTE'); assert.equal(matrix.body.rows[0].methodology, 'Not extracted');
    assert.equal((await request(port, 'POST', '/api/research/matrix', { papers: Array(11).fill({ paperId: 'one' }) }, token)).status, 400);
    assert.equal((await request(port, 'GET', '/api/research/suggestions?q=Approved')).body.suggestions[0], 'Approved title');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    User.findById = original.findById; User.findOne = original.findOne; User.updateOne = original.updateOne; Thesis.find = original.thesisFind; Thesis.aggregate = original.aggregate;
    PaperSummary.find = original.summaryFind; entitlement.getEffectiveEntitlements = original.entitlement;
    if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
    delete require.cache[routePath]; if (originalRoute) require.cache[routePath] = originalRoute;
  }
}
module.exports = { runResearchFeaturesTests };
