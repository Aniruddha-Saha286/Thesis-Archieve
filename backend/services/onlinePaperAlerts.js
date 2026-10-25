const crypto = require('crypto');
const Notification = require('../models/Notification');
const { searchOpenAlex } = require('./providers/openalex');
const { queryMatch } = require('./queryRelevance');
const { ResearchCache } = require('./researchCache');
const { emitToUser } = require('../socket');
const cache = new ResearchCache({ ttl: 15 * 60000, maxEntries: 200, maxBytes: 8 * 1024 * 1024 });

// A bounded recent-publication scan complements the curated venue index. It is
// intentionally described as sampled coverage, never a watch on the whole web.
async function checkOnlinePapers(user, alert, now = new Date(), search = searchOpenAlex) {
  if (alert.venueId) return 0;
  if (process.env.OFFLINE_MODE === 'true') {
    alert.onlineCheckStatus = 'disabled';
    return 0; // Never send sample data as a real research alert.
  }
  if (alert.onlineCheckedAt && now - alert.onlineCheckedAt < 15 * 60000) return 0;
  const from = new Date(Math.max(Date.parse(alert.createdAt) || now.getTime(), now.getTime() - 30 * 86400000)).toISOString().slice(0, 10);
  const params = { query: alert.topic, limit: 50, page: 1, sort: 'newest',
    filters: { fromPublicationDate: from, toPublicationDate: now.toISOString().slice(0, 10), publicationType: alert.publicationType || undefined } };
  try {
    const result = await cache.get(JSON.stringify(params), () => search(params));
    if (result.error) throw new Error('Source unavailable');
    const records = result.records.filter(record => !record.isSample && (record.doi || record.id) && record.title && queryMatch(record, alert.topic).accepted &&
      (!alert.publicationType || ['thesis', 'dissertation'].includes(record.publicationType)) &&
      (!alert.category || alert.category === 'All Disciplines' || record.category === alert.category));
    const indexed = records.map(record => ({ record, key: `openalex:${String(record.doi || record.id).toLowerCase()}` }));
    const existing = await Notification.find({ user: user._id, type: 'topic_alert', 'data.alertId': String(alert._id), 'data.paperIds': { $in: indexed.map(p => p.key) } }).select('data.paperIds').lean();
    const notified = new Set(existing.flatMap(n => n.data?.paperIds || []));
    const fresh = indexed.filter(p => !notified.has(p.key));
    let created = 0;
    if (fresh.length) {
      const paperIds = [...new Set(fresh.map(p => p.key))].sort();
      const dedupeKey = `online:${user._id}:${alert._id}:` + crypto.createHash('sha256').update(paperIds.join('|')).digest('hex');
      const notification = { user: user._id, type: 'topic_alert', title: `${paperIds.length} new match${paperIds.length === 1 ? '' : 'es'}: ${alert.topic}`,
        message: `Recently published research found in OpenAlex, including “${fresh[0].record.title.slice(0, 150)}”.`,
        link: `/?q=${encodeURIComponent(alert.topic)}${alert.publicationType ? '&type=thesis' : ''}`,
        data: { alertId: String(alert._id), topic: alert.topic, paperIds, matchedCount: paperIds.length,
          basis: 'Sample of up to 50 recent OpenAlex publications; source indexing can be delayed',
          papers: fresh.slice(0, 5).map(({ record }) => ({ title: record.title, doi: record.doi || '', url: record.fullTextUrl || '' })) }, dedupeKey };
      const saved = await Notification.findOneAndUpdate({ dedupeKey }, { $setOnInsert: notification }, { upsert: true, new: true, includeResultMetadata: true });
      if (!saved.lastErrorObject.updatedExisting) { created = 1; emitToUser(String(user._id), 'notification:new', saved.value); }
    }
    alert.onlineCheckedAt = now;
    alert.onlineCheckStatus = result.hasMore ? 'limited' : 'ok';
    return created;
  } catch {
    alert.onlineCheckStatus = 'unavailable';
    return 0;
  }
}
module.exports = { checkOnlinePapers };
