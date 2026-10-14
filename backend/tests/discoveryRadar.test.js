const assert = require('assert');
const { identifyVenue, statusLabel } = require('../services/venueCatalog');
const { normalizeDiscovery, identityKeys, mergeDiscovery, arxivId } = require('../services/discoveryRecord');
const { mapOpenReview, parseOfficialPaper } = require('../services/providers/discoveryOfficial');
const { jobsFor, parseFeedQuery, readFeed, upsertPaper, syncDiscovery, feedHealth } = require('../services/discoveryFeed');
const { parseAndValidateThesisQuery } = require('../services/queryParser');
const { sortRecords, computeSessionHash } = require('../services/searchSessionManager');
const DiscoveryPaper = require('../models/DiscoveryPaper');
const DiscoverySync = require('../models/DiscoverySync');
const Notification = require('../models/Notification');
const { matchesAlert, checkDiscoveryAlert } = require('../services/discoveryAlerts');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
async function testRadarAccess() {
  const oldFind = User.findById, oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'synthetic-radar-test-secret';
  let status = 'approved';
  User.findById = () => ({ select: async () => ({ _id: '012345678901234567890123', role: 'student', status }) });
  const app = express(); app.use('/api/research', require('../routes/research'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (path, token) => new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path, headers: token ? { Authorization: 'Bearer ' + token } : {} }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject);
  });
  try {
    assert.strictEqual(await request('/api/research/radar'), 401);
    const token = jwt.sign({ id: '012345678901234567890123' }, process.env.JWT_SECRET);
    status = 'pending'; assert.strictEqual(await request('/api/research/radar', token), 403);
    status = 'banned'; assert.strictEqual(await request('/api/research/radar', token), 403);
    status = 'approved'; assert.strictEqual(await request('/api/research/radar?venue=jclr', token), 400);
  } finally {
    await new Promise(resolve => server.close(resolve)); User.findById = oldFind;
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
}
async function runDiscoveryRadarTests() {
  for (const [name, expected] of [['IEEE/CVF Conference on Computer Vision and Pattern Recognition', 'cvpr'], ['European Conference on Computer Vision', 'eccv'], ['ICLR 2026', 'iclr'], ['J. Mach. Learn. Res.', 'jmlr'], ['Journal of Machine Learning Research', 'jmlr'], ['JCLR', null], ['CVPR Workshops', null], ['CVPRW 2026', null]]) assert.strictEqual(identifyVenue(name), expected, name);
  assert.strictEqual(arxivId('https://arxiv.org/abs/2601.12345v3'), '2601.12345');
  const pre = normalizeDiscovery({ id: 'a', title: 'Vision transformers for medical segmentation', authors: ['Ada Lovelace'], publishedYear: 2026, venue: 'arXiv cs.CV', catalogId: 'arXiv:2601.12345v2', publicationType: 'preprint', source: 'arXiv', fullTextUrl: 'https://arxiv.org/abs/2601.12345', codeUrl: 'javascript:alert(1)' });
  assert.strictEqual(pre.publicationDate, null); assert.strictEqual(pre.codeUrl, null); assert.strictEqual(pre.license, null);
  const job = { provider: 'openreview', venueId: 'iclr', year: 2026 };
  const note = { id: 'accepted123', cdate: Date.now(), content: { title: { value: pre.title }, authors: { value: ['Ada Lovelace'] }, venueid: { value: 'ICLR.cc/2026/Conference' }, pdf: { value: '/pdf?id=accepted123' } } };
  const accepted = mapOpenReview(note, job); assert.strictEqual(accepted.acceptanceStatus, 'accepted'); assert.strictEqual(accepted.publicationDate, null);
  assert.strictEqual(mapOpenReview({ ...note, content: { ...note.content, venueid: { value: 'ICLR.cc/2026/Conference/Rejected' } } }, job), null);
  assert.strictEqual(mapOpenReview({ ...note, ddate: 1 }, job), null);
  assert(statusLabel(pre).startsWith('Preprint')); assert(statusLabel(accepted).startsWith('Accepted'));
  const merged = mergeDiscovery(pre, accepted); assert.strictEqual(merged.venueId, 'iclr'); assert.strictEqual(merged.isPeerReviewed, true); assert.strictEqual(pre.sources.length, 1); assert(merged.alternateVersions.length === 2); assert(identityKeys(pre).some(k => identityKeys(accepted).includes(k)));
  const html = '<meta name="citation_title" content="Image models"><meta name="citation_author" content="Ada"><meta name="citation_journal_title" content="Journal of Machine Learning Research"><meta name="citation_date" content="2026/10/02"><meta name="citation_pdf_url" content="/papers/v27/a/a.pdf"><div id="abstract">Source abstract</div><a href="https://github.com/example/image">code</a>';
  const official = parseOfficialPaper(html, 'https://www.jmlr.org/papers/v27/a.html', { provider: 'jmlr', venueId: 'jmlr', year: 2026 });
  assert.strictEqual(official.publicationDate, '2026-10-02'); assert.strictEqual(official.venueId, 'jmlr'); assert(official.codeEvidence); assert.strictEqual(official.license, null);
  const now = new Date('2026-10-11T00:00:00Z'); const short = parseFeedQuery({ range: '7', venue: 'cvpr', provider: 'DBLP' }, now);
  assert.strictEqual(short.filter.venueId, 'cvpr'); assert.strictEqual(short.filter.providers, 'DBLP'); assert(short.filter.publicationDate.$gte instanceof Date);
  assert.strictEqual(parseFeedQuery({ range: 'year' }, now).filter.publishedYear, 2026);
  assert.strictEqual(parseFeedQuery({}, now).filter.publishedYear, 2026);
  assert.throws(() => parseFeedQuery({ venue: 'iccv', year: '2026' }, now), /odd-year/);
  assert.throws(() => parseFeedQuery({ venue: 'eccv', year: '2025' }, now), /even-year/);
  assert.throws(() => parseFeedQuery({ year: '2027' }, now), /edition/);
  assert.strictEqual(parseFeedQuery({ venue: 'iccv', year: '2025' }, now).filter.publishedYear, 2025);
  const healthEnv = { RADAR_YEARS: '2026' };
  const healthJob = jobsFor(healthEnv, now)[0];
  assert.strictEqual(feedHealth([], false, healthEnv, now).health.state, 'disabled');
  assert.strictEqual(feedHealth([], false, { ...healthEnv, RADAR_INGESTION_ENABLED: 'true' }, now).health.state, 'waiting');
  assert.strictEqual(feedHealth([], false, healthEnv, now).health.configuredJobs, jobsFor(healthEnv, now).length);
  assert.strictEqual(feedHealth([{ ...healthJob, status: 'ok', lastSuccessAt: now }], true, healthEnv, now).health.state, 'indexed');
  assert.strictEqual(feedHealth([{ ...healthJob, status: 'ok', lastSuccessAt: '2026-10-01' }], true, healthEnv, now).health.state, 'stale');
  assert.strictEqual(feedHealth([{ ...healthJob, status: 'unavailable' }], true, healthEnv, now).health.state, 'partial_failure');
  assert.strictEqual(feedHealth([{ ...healthJob, status: 'syncing', leaseUntil: new Date(now.getTime() + 1000) }], false, healthEnv, now).health.state, 'syncing');
  assert.strictEqual(feedHealth([{ ...healthJob, status: 'syncing', leaseUntil: new Date(0) }], false, healthEnv, now).sync[0].status, 'interrupted');
  assert.strictEqual(parseFeedQuery({ mode: 'activity' }, now).field, 'firstSeenAt');
  assert.throws(() => parseFeedQuery({ venue: 'jclr' }), /venue/); assert.throws(() => parseFeedQuery({ cursor: 'invalid' }), /cursor/);
  const cursor = Buffer.from(JSON.stringify({ f: short.fingerprint, id: '012345678901234567890123', at: '2026-10-09T00:00:00.000Z', snapshot: now.toISOString() })).toString('base64url');
  const next = parseFeedQuery({ range: '7', venue: 'cvpr', provider: 'DBLP', cursor }, now); assert(next.filter.$and[0].$or.some(x => x.publicationDate === null));
  assert.throws(() => parseFeedQuery({ range: '30', cursor }, now));
  assert.strictEqual(parseAndValidateThesisQuery({ venue: 'iclr', source: 'DBLP' }).filters.venue, 'iclr');
  assert.strictEqual(parseAndValidateThesisQuery({ venue: 'jclr' }).valid, false);
  assert.notStrictEqual(computeSessionHash('', { venue: 'cvpr' }), computeSessionHash('', { venue: 'iclr' }));
  const sorted = [{ id: 'early', publishedYear: 2026, publicationDate: '2026-01-05' }, { id: 'late', publishedYear: 2026, publicationDate: '2026-10-10' }, { id: 'unknown', publishedYear: 2026, datePrecision: 'year' }];
  sortRecords(sorted, 'newest', '', 1); assert.deepStrictEqual(sorted.map(r => r.id), ['late', 'early', 'unknown']);
  const jobs = jobsFor({}, now); assert(jobs.some(j => j.venueId === 'eccv' && j.year === 2026)); assert(!jobs.some(j => j.venueId === 'iccv' && j.year === 2026));
  assert(matchesAlert(accepted, { topic: 'ICLR', venueId: 'iclr' })); assert(!matchesAlert(pre, { topic: 'ICLR', venueId: 'iclr' }));
  assert(!matchesAlert(accepted, { topic: 'crop disease' }));
  const originals = { find: DiscoveryPaper.find, findOne: DiscoveryPaper.findOne, create: DiscoveryPaper.create, update: DiscoveryPaper.updateOne, syncFind: DiscoverySync.find, syncLease: DiscoverySync.findOneAndUpdate, syncUpdate: DiscoverySync.updateOne, notify: Notification.findOneAndUpdate };
  const chain = data => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => data });
  try {
    let stored = null;
    DiscoveryPaper.findOne = () => chain(stored);
    DiscoveryPaper.create = async d => { stored = { ...d, _id: '012345678901234567890123' }; };
    DiscoveryPaper.updateOne = async (_filter, update) => { stored = { ...stored, ...update.$set, identityKeys: [...new Set([...stored.identityKeys, ...update.$addToSet.identityKeys.$each])] }; return { matchedCount: 1 }; };
    await upsertPaper(pre, now); await upsertPaper(accepted, now); assert.strictEqual(stored.record.venueId, 'iclr'); assert.strictEqual(stored.firstSeenAt, now);
    DiscoveryPaper.find = () => chain([{ _id: stored._id, record: accepted, firstSeenAt: now, publicationDate: null }]);
    DiscoverySync.find = () => chain([]);
    const feed = await readFeed({ range: 'year', q: 'unique-test' }); assert.strictEqual(feed.records[0].id, 'radar_' + stored._id); assert.strictEqual(feed.records[0].reviewLabel, 'Accepted · peer reviewed');
    DiscoveryPaper.find = () => chain(Array.from({ length: 13 }, (_, i) => ({ _id: String(i + 1).padStart(24, '0'), record: accepted, firstSeenAt: now, publicationDate: new Date('2026-10-02') })));
    const paged = await readFeed({ range: 'year', q: 'pagination-test' }); assert.strictEqual(paged.records.length, 12); assert(paged.nextCursor);
    const pageQuery = parseFeedQuery({ range: 'year', q: 'pagination-test', cursor: paged.nextCursor }); assert.strictEqual(pageQuery.filter.$and[0].$or.at(-1)._id.$lt, '000000000000000000000012');
    DiscoveryPaper.find = () => chain([{ _id: stored._id, record: accepted, firstSeenAt: now, publicationDate: null }]);
    const receipts = new Set(); Notification.findOneAndUpdate = async ({ dedupeKey }) => { const existing = receipts.has(dedupeKey); receipts.add(dedupeKey); return { lastErrorObject: { updatedExisting: existing }, value: {} }; };
    const alert = { _id: 'alert1', topic: 'ICLR', venueId: 'iclr', createdAt: new Date('2026-10-01') };
    assert.strictEqual(await checkDiscoveryAlert({ _id: 'u1' }, alert, now), 1); assert.strictEqual(await checkDiscoveryAlert({ _id: 'u1' }, alert, now), 0);
    const updates = []; DiscoverySync.findOneAndUpdate = async () => ({ offset: 10 }); DiscoverySync.updateOne = async (filter, update) => updates.push({ filter, update });
    let calls = 0; const result = await syncDiscovery({ env: { RADAR_YEARS: '2026', RADAR_JOBS_PER_RUN: '2' }, fetcher: async () => { if (!calls++) throw new Error('provider down'); return { records: [], hasMore: false }; }, persist: async () => true });
    assert.deepStrictEqual(result.results.map(r => r.status), ['unavailable', 'ok']); assert(!('offset' in updates[0].update.$set));
  } finally {
    DiscoveryPaper.find = originals.find; DiscoveryPaper.findOne = originals.findOne; DiscoveryPaper.create = originals.create; DiscoveryPaper.updateOne = originals.update;
    DiscoverySync.find = originals.syncFind; DiscoverySync.findOneAndUpdate = originals.syncLease; DiscoverySync.updateOne = originals.syncUpdate; Notification.findOneAndUpdate = originals.notify;
  }
  await testRadarAccess();
  await require('./radarFollows.test').testRadarFollows();
  console.log('Research Radar: venue identity, provenance, dates, cursors, idempotent upserts, alert deduplication, partial ingestion failure and protected route access passed.');
}
module.exports = { runDiscoveryRadarTests };
if (require.main === module) runDiscoveryRadarTests().catch(err => { console.error(err); process.exitCode = 1; });
