const DiscoveryPaper = require('../models/DiscoveryPaper');
const Notification = require('../models/Notification');
const { queryMatch } = require('./queryRelevance');
const { emitToUser } = require('../socket');
function matchesAlert(record, alert) {
  if (alert.venueId && record.venueId !== alert.venueId) return false;
  if (alert.venueId && [alert.venueId, 'arxiv cs.cv'].includes(alert.topic.trim().toLowerCase())) return true;
  if (alert.category && alert.category !== 'All Disciplines' && record.category !== alert.category) return false;
  return queryMatch(record, alert.topic).accepted;
}
async function checkDiscoveryAlert(user, alert, until = new Date()) {
  const since = alert.externalCheckedAt || alert.createdAt || new Date(until.getTime() - 7 * 86400000);
  const filter = { firstSeenAt: { $gt: since, $lte: until } };
  if (alert.externalCheckedId) {
    filter.firstSeenAt = { $lte: until };
    filter.$or = [{ firstSeenAt: { $gt: since } }, { firstSeenAt: since, _id: { $gt: alert.externalCheckedId } }];
  }
  if (alert.venueId) filter.venueId = alert.venueId;
  const docs = await DiscoveryPaper.find(filter).sort({ firstSeenAt: 1, _id: 1 }).limit(200).lean();
  let created = 0;
  for (const d of docs.filter(d => matchesAlert(d.record, alert))) {
    const key = `radar:${user._id}:${alert._id}:${d._id}`;
    const notification = { user: user._id, type: 'topic_alert', title: `New research: ${alert.topic}`, message: d.record.title.slice(0, 200),
      link: '/?view=radar', data: { alertId: String(alert._id), topic: alert.topic, paperIds: ['radar_' + d._id], matchedCount: 1, basis: 'Newly indexed external paper' }, dedupeKey: key };
    try {
      const result = await Notification.findOneAndUpdate({ dedupeKey: key }, { $setOnInsert: notification }, { upsert: true, new: true, includeResultMetadata: true });
      if (!result.lastErrorObject.updatedExisting) { created++; emitToUser(String(user._id), 'notification:new', result.value); }
    } catch (err) { if (err.code !== 11000) throw err; }
  }
  alert.externalCheckedAt = docs.length === 200 ? docs.at(-1).firstSeenAt : until;
  alert.externalCheckedId = docs.length === 200 ? String(docs.at(-1)._id) : '';
  return created;
}
module.exports = { matchesAlert, checkDiscoveryAlert };
