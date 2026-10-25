const User = require('../models/User');
const Thesis = require('../models/Thesis');
const Notification = require('../models/Notification');
const { getEffectiveEntitlements } = require('./entitlementService');
const { emitToUser } = require('../socket');
const { checkDiscoveryAlert } = require('./discoveryAlerts');
const { checkOnlinePapers } = require('./onlinePaperAlerts');

let isRunning = false;

const pendingChecks = new Map();
function checkAlertsForUser(userId) {
  const key = String(userId);
  if (!pendingChecks.has(key)) pendingChecks.set(key, evaluateAlertsForUser(userId).finally(() => pendingChecks.delete(key)));
  return pendingChecks.get(key);
}

async function evaluateAlertsForUser(userId) {
  const user = await User.findById(userId);
  if (!user || user.status !== 'approved' || !Array.isArray(user.topicAlerts) || user.topicAlerts.length === 0) {
    return { notificationsCreated: 0 };
  }

  let maxAllowedAlerts = 0;
  try {
    const entitlements = await getEffectiveEntitlements(user._id);
    maxAllowedAlerts = entitlements.quotas?.maxTopicAlerts || 0;
    if (maxAllowedAlerts <= 0) {
      return { notificationsCreated: 0, reason: 'membership_required' };
    }
  } catch (err) {
    return { notificationsCreated: 0, error: err.message };
  }

  let totalNotificationsCreated = 0;
  let evaluatedAlertsCount = 0;

  for (const alert of user.topicAlerts) {
    if (!alert.active) continue;
    if (evaluatedAlertsCount >= maxAllowedAlerts) {
      break;
    }
    evaluatedAlertsCount++;

    const checkStartedAt = new Date();
    totalNotificationsCreated += await checkDiscoveryAlert(user, alert, checkStartedAt);
    totalNotificationsCreated += await checkOnlinePapers(user, alert, checkStartedAt);
    if (alert.venueId) continue;

    const lastChecked = alert.lastCheckedAt || alert.createdAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const regex = new RegExp(alert.topic.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const filter = {
      status: 'approved',
      $or: [
        { title: regex },
        { abstract: regex },
        { author: regex },
      ],
      $and: [
        {
          $or: [
            { approvedAt: { $gt: lastChecked } },
            { updatedAt: { $gt: lastChecked } },
            { createdAt: { $gt: lastChecked } },
          ],
        },
      ],
    };
    if (alert.publicationType === 'thesis') filter.publicationType = { $in: ['thesis', 'dissertation'] };

    if (alert.category && alert.category !== 'All Disciplines') {
      filter.category = alert.category;
    }

    const matchingTheses = await Thesis.find(filter)
      .sort({ approvedAt: 1, updatedAt: 1, createdAt: 1 })
      .lean();

    if (matchingTheses.length > 0) {
      const existingNotifs = await Notification.find({
        user: user._id,
        type: 'topic_alert',
        'data.alertId': String(alert._id),
      }).select('data.paperIds').lean();

      const notifiedPaperIdSet = new Set();
      for (const notif of existingNotifs) {
        if (Array.isArray(notif.data?.paperIds)) {
          for (const pid of notif.data.paperIds) {
            notifiedPaperIdSet.add(String(pid));
          }
        }
      }

      const trulyNewTheses = matchingTheses.filter((t) => !notifiedPaperIdSet.has(String(t._id)));

      if (trulyNewTheses.length > 0) {
        const newPaperIds = trulyNewTheses.map((t) => String(t._id));
        const notifTitle = `New Research Matches: "${alert.topic}"`;
        const notifMsg = `Found ${trulyNewTheses.length} new publication(s) including "${trulyNewTheses[0].title.slice(0, 70)}..." matching your topic inquiry.`;

        const newNotif = new Notification({
          user: user._id,
          type: 'topic_alert',
          title: notifTitle,
          message: notifMsg,
          link: `/?q=${encodeURIComponent(alert.topic)}`,
          data: {
            alertId: String(alert._id),
            topic: alert.topic,
            paperIds: newPaperIds,
            matchedCount: trulyNewTheses.length,
          },
        });

        await newNotif.save();
        totalNotificationsCreated++;

        emitToUser(String(user._id), 'notification:new', newNotif);
      }
    }

    alert.lastCheckedAt = checkStartedAt;
  }

  // Update only cursors, so scans cannot resurrect deleted follows or overwrite
  // a profile/membership edit that happened while a provider was answering.
  for (const alert of user.topicAlerts) {
    const fields = ['lastCheckedAt', 'externalCheckedAt', 'externalCheckedId', 'onlineCheckedAt', 'onlineCheckStatus'];
    const values = Object.fromEntries(fields.filter(f => alert[f] != null).map(f => [`topicAlerts.$.${f}`, alert[f]]));
    if (Object.keys(values).length) await User.updateOne({ _id: user._id, 'topicAlerts._id': alert._id }, { $set: values });
  }
  return { notificationsCreated: totalNotificationsCreated,
    sourceWarnings: user.topicAlerts.filter(a => a.active && a.onlineCheckStatus === 'unavailable').map(a => a.topic) };
}

async function runAllScheduledAlerts() {
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    const usersWithAlerts = await User.find({
      'topicAlerts.active': true,
      status: 'approved',
    }).select('_id');

    for (const u of usersWithAlerts) {
      try { await checkAlertsForUser(u._id); }
      catch (err) { console.error('Topic alert check failed for a member:', err.message); }
    }
  } catch (err) {
    console.error('Error running scheduled topic alerts:', err);
  } finally {
    isRunning = false;
  }
}

module.exports = {
  checkAlertsForUser,
  runAllScheduledAlerts,
};
