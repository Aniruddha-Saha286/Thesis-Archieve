const crypto = require('crypto');
const DiscoveryPaper = require('../models/DiscoveryPaper');
const DiscoverySync = require('../models/DiscoverySync');
const { VENUES, statusLabel } = require('./venueCatalog');
const { ResearchCache } = require('./researchCache');
const { metadataText } = require('./queryRelevance');
const { normalizeDiscovery, identityKeys, mergeDiscovery } = require('./discoveryRecord');
const { fetchOfficial } = require('./providers/discoveryOfficial');
const { searchDblp } = require('./providers/dblp');
const { searchArxiv } = require('./providers/arxiv');
const cache = new ResearchCache({ ttl: 60000, maxEntries: 100, maxBytes: 4 * 1024 * 1024 });
function jobsFor(env = process.env, now = new Date()) {
  const current = now.getUTCFullYear();
  const years = [...new Set(String(env.RADAR_YEARS || `${current},${current - 1}`).split(',').map(Number).filter(y => Number.isInteger(y) && y >= 2000 && y <= current))].slice(0, 3);
  const jobs = [];
  for (const year of years) for (const v of VENUES.filter(v => v.id !== 'arxiv')) {
    const provider = ['iclr', 'neurips'].includes(v.id) ? 'openreview' : v.id === 'jmlr' ? 'jmlr' : v.id === 'eccv' ? 'dblp' : 'cvf';
    // Alternate-year conferences do not have proceedings every year.
    if ((v.id === 'iccv' && year % 2 === 0) || (v.id === 'eccv' && year % 2 !== 0)) continue;
    jobs.push({ key: `${provider}:${v.id}:${year}`, provider, venueId: v.id, year });
    if (provider !== 'dblp' && provider !== 'jmlr') jobs.push({ key: `dblp:${v.id}:${year}`, provider: 'dblp', venueId: v.id, year });
  }
  jobs.push({ key: 'arxiv:cs.CV', provider: 'arxiv', venueId: 'arxiv', year: current });
  return jobs;
}
async function fetchJob(job, offset, limit) {
  if (job.provider === 'dblp') {
    const result = await searchDblp({ query: `venue:${job.venueId === 'jmlr' ? 'J. Mach. Learn. Res.' : job.venueId.toUpperCase()}: year:${job.year}:`, offset, limit, filters: { yearMin: job.year, yearMax: job.year } });
    if (result.error) throw new Error('DBLP unavailable');
    return { ...result, records: result.records.map(r => normalizeDiscovery({ ...r, source: 'DBLP', datePrecision: 'year', acceptanceStatus: 'unknown' })) };
  }
  if (job.provider === 'arxiv') {
    const result = await searchArxiv({ query: '', offset, limit, filters: { arxivCategory: 'cs.CV' }, sort: 'newest' });
    if (result.error) throw new Error('arXiv unavailable');
    const recent = result.records.filter(r => Date.parse(r.publicationDate) >= Date.now() - 90 * 86400000);
    return { ...result, records: recent.map(r => normalizeDiscovery({ ...r, source: 'arXiv', venue: 'arXiv cs.CV', publicationType: 'preprint', isPeerReviewed: false, acceptanceStatus: 'preprint' })), hasMore: result.hasMore && recent.length === result.records.length };
  }
  return fetchOfficial(job, offset, limit);
}
async function upsertPaper(input, now = new Date()) {
  if (!input.title || input.isSample) return false;
  const keys = identityKeys(input); if (!keys.length) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const old = await DiscoveryPaper.findOne({ identityKeys: { $in: keys } }).lean();
    const record = old ? mergeDiscovery(old.record, input) : input;
    const fields = { record, venueId: record.venueId, publishedYear: record.publishedYear, publicationDate: record.datePrecision === 'day' && record.publicationDate ? new Date(record.publicationDate) : null, lastSeenAt: now,
      searchText: metadataText(record).slice(0, 20000) };
    try {
      if (old) {
        // Identity metadata grows monotonically; concurrent syncs are serialized by job leases.
        await DiscoveryPaper.updateOne({ _id: old._id, lastSeenAt: old.lastSeenAt }, { $set: fields, $addToSet: { identityKeys: { $each: keys }, providers: { $each: input.sources.map(s => s.provider) } } }).then(result => { if (!result.matchedCount) throw Object.assign(new Error('Concurrent update'), { code: 11000 }); });
      } else await DiscoveryPaper.create({ ...fields, identityKeys: keys, providers: input.sources.map(s => s.provider), firstSeenAt: now });
      return true;
    } catch (err) { if (err.code !== 11000 || attempt === 2) throw err; }
  }
}
let running = false;
async function syncDiscovery({ env = process.env, fetcher = fetchJob, persist = upsertPaper } = {}) {
  if (running) return { skipped: true }; running = true;
  const results = [];
  try {
    const size = Math.max(1, Math.min(30, Math.floor(Number(env.RADAR_BATCH_SIZE)) || 10));
    // Least recently attempted jobs run first so unavailable venues cannot starve others.
    const configured = jobsFor(env);
    const states = await DiscoverySync.find({ key: { $in: configured.map(j => j.key) } }).lean();
    configured.sort((a, b) => (Date.parse(states.find(s => s.key === a.key)?.lastAttemptAt) || 0) - (Date.parse(states.find(s => s.key === b.key)?.lastAttemptAt) || 0));
    const maxJobs = Math.max(1, Math.min(20, Number(env.RADAR_JOBS_PER_RUN) || 3));
    for (const job of configured.slice(0, maxJobs)) {
      const now = new Date(); let lease;
      try {
        lease = await DiscoverySync.findOneAndUpdate({ key: job.key, leaseUntil: { $lte: now } }, { $set: { ...job, lastAttemptAt: now, leaseUntil: new Date(now.getTime() + 20 * 60 * 1000), status: 'syncing' } }, { upsert: true, new: true });
      } catch (err) { if (err.code === 11000) continue; throw err; }
      try {
        const batch = await fetcher(job, lease.offset || 0, size); let accepted = 0;
        for (const r of batch.records || []) {
          if (r.venueId !== job.venueId) continue;
          if (await persist(r, new Date())) accepted++;
        }
        await DiscoverySync.updateOne({ key: job.key }, { $set: { offset: batch.hasMore ? batch.nextOffset : 0, lastSuccessAt: new Date(), status: 'ok', accepted, leaseUntil: new Date(0) } });
        results.push({ key: job.key, status: 'ok', accepted });
      } catch {
        // A failed batch keeps its cursor; successful upserts are safe to replay.
        await DiscoverySync.updateOne({ key: job.key }, { $set: { status: 'unavailable', leaseUntil: new Date(0) } });
        results.push({ key: job.key, status: 'unavailable' });
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    cache.clear(); return { results };
  } finally { running = false; }
}
function parseFeedQuery(raw = {}, now = new Date()) {
  const scalar = key => typeof raw[key] === 'string' ? raw[key] : '';
  const venue = scalar('venue'), provider = scalar('provider'), range = scalar('range') || 'year', mode = scalar('mode') || 'publication';
  if (venue && !VENUES.some(v => v.id === venue)) throw new Error('Choose a supported venue.');
  if (provider && !['CVF', 'JMLR', 'OpenReview', 'DBLP', 'arXiv'].includes(provider)) throw new Error('Choose a supported source.');
  if (!['7', '30', '90', 'year'].includes(range) || !['publication', 'activity'].includes(mode)) throw new Error('Invalid time window.');
  const q = scalar('q').trim().slice(0, 150);
  const year = scalar('year'); if (year && !/^20\d{2}$/.test(year)) throw new Error('Invalid year.');
  if (year && (Number(year) > now.getUTCFullYear() || Number(year) < 2000)) throw new Error('Choose a published edition year.');
  if (year && ((venue === 'iccv' && Number(year) % 2 !== 1) || (venue === 'eccv' && Number(year) % 2 !== 0))) throw new Error('ICCV has odd-year editions; ECCV has even-year editions.');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ venue, provider, range, mode, q, year })).digest('hex').slice(0, 20);
  let cursor = null;
  if (raw.cursor) {
    try { cursor = JSON.parse(Buffer.from(scalar('cursor').slice(0, 1000), 'base64url').toString()); } catch { throw new Error('Invalid page cursor.'); }
    if (cursor.f !== fingerprint || !/^[a-f0-9]{24}$/.test(cursor.id) || !Number.isFinite(Date.parse(cursor.at)) || !Number.isFinite(Date.parse(cursor.snapshot)) || Date.parse(cursor.snapshot) > now.getTime()) throw new Error('Invalid page cursor.');
  }
  const snapshot = cursor ? new Date(cursor.snapshot) : now;
  const since = range === 'year' ? new Date(Date.UTC(snapshot.getUTCFullYear(), 0, 1)) : new Date(snapshot.getTime() - Number(range) * 86400000);
  const field = mode === 'activity' ? 'firstSeenAt' : 'publicationDate';
  const filter = { firstSeenAt: { $lte: snapshot } };
  if (venue) filter.venueId = venue;
  if (provider) filter.providers = provider;
  if (year) filter.publishedYear = Number(year);
  if (q) filter.$text = { $search: q };
  // The annual publication view includes year-only metadata; short windows require an exact day.
  if (mode === 'publication' && range === 'year') filter.publishedYear = Number(year) || snapshot.getUTCFullYear();
  else filter[field] = { ...(filter[field] || {}), $gte: since, $lte: snapshot };
  if (cursor) {
    const at = cursor.at === '1970-01-01T00:00:00.000Z' ? null : new Date(cursor.at);
    filter.$and = [{ $or: [...(at ? [{ [field]: { $lt: at } }, { [field]: null }] : []), { [field]: at, _id: { $lt: cursor.id } }] }];
  }
  const requestedLimit = Number(scalar('limit'));
  return { filter, field, snapshot, fingerprint, q, mode, limit: Number.isFinite(requestedLimit) ? Math.max(1, Math.min(30, Math.floor(requestedLimit) || 12)) : 12 };
}
function feedHealth(states, hasIndexedPapers, env = process.env, now = new Date()) {
  const configured = jobsFor(env, now);
  const sync = configured.map(job => {
    const state = states.find(s => s.key === job.key);
    const expired = state?.status === 'syncing' && !(Date.parse(state.leaseUntil) > now.getTime());
    return { ...job, status: expired ? 'interrupted' : state?.status || 'waiting', lastAttemptAt: state?.lastAttemptAt || null, lastSuccessAt: state?.lastSuccessAt || null };
  });
  const enabled = env.RADAR_INGESTION_ENABLED === 'true';
  const failed = sync.filter(s => ['unavailable', 'interrupted'].includes(s.status)).length;
  const syncing = sync.some(s => s.status === 'syncing');
  const lastSuccess = Math.max(0, ...sync.map(s => Date.parse(s.lastSuccessAt) || 0));
  const stale = hasIndexedPapers && (!lastSuccess || now.getTime() - lastSuccess > 48 * 3600000);
  return { sync, health: { ingestionEnabled: enabled, hasIndexedPapers, configuredJobs: configured.length, failedJobs: failed,
    state: syncing ? 'syncing' : failed ? 'partial_failure' : !hasIndexedPapers ? (enabled ? 'waiting' : 'disabled') : stale ? 'stale' : 'indexed',
    lastSuccessAt: lastSuccess ? new Date(lastSuccess).toISOString() : null, stale } };
}
async function readFeed(raw) {
  const parsed = parseFeedQuery(raw);
  return cache.get(JSON.stringify(raw), async () => {
    const docs = await DiscoveryPaper.find(parsed.filter).sort({ [parsed.field]: -1, _id: -1 }).limit(parsed.limit + 1).lean();
    const [states, indexed] = await Promise.all([
      DiscoverySync.find({ key: { $in: jobsFor(process.env).map(j => j.key) } }).select('key status leaseUntil lastAttemptAt lastSuccessAt -_id').limit(100).lean(),
      DiscoveryPaper.findOne({}).select('_id').lean(),
    ]);
    const availability = feedHealth(states, Boolean(indexed));
    const hasMore = docs.length > parsed.limit, page = docs.slice(0, parsed.limit), last = page.at(-1);
    return { records: page.map(d => ({ ...d.record, id: 'radar_' + d._id, _id: 'radar_' + d._id, isExternal: true, firstSeenAt: d.firstSeenAt, reviewLabel: statusLabel(d.record) })),
      nextCursor: hasMore ? Buffer.from(JSON.stringify({ id: String(last._id), at: last[parsed.field]?.toISOString() || '1970-01-01T00:00:00.000Z', snapshot: parsed.snapshot.toISOString(), f: parsed.fingerprint })).toString('base64url') : null,
      mode: parsed.mode, basis: parsed.mode === 'activity' ? 'Newly indexed records; this is discovery activity, not publication or popularity.' : parsed.filter.publishedYear && !(raw.range && raw.range !== 'year') ? `Publication year ${parsed.filter.publishedYear}, including year-only source dates. This does not mean all papers were published recently.` : 'Source publication dates. Short windows exclude records whose exact publication day is unknown.',
      ...availability, venues: VENUES,
    };
  });
}
function startDiscoveryScheduler(env = process.env) {
  if (env.RADAR_INGESTION_ENABLED !== 'true') return null;
  const interval = Math.max(5, Math.min(1440, Number(env.RADAR_INTERVAL_MINUTES) || 60)) * 60000;
  // No network calls until explicitly enabled; never run ingestion during test startup.
  const tick = () => syncDiscovery({ env }).catch(() => console.error('Discovery sync failed.'));
  const timer = setInterval(tick, interval); timer.unref(); return timer;
}
module.exports = { jobsFor, fetchJob, upsertPaper, syncDiscovery, parseFeedQuery, readFeed, feedHealth, startDiscoveryScheduler };
