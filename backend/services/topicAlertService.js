const User = require('../models/User');
const Thesis = require('../models/Thesis');
const Notification = require('../models/Notification');
const { getEffectiveEntitlements } = require('./entitlementService');
const { emitToUser } = require('../socket');

let isRunning = false;

async function checkAlertsForUser(userId) {
  const user = await User.findById(userId);
  if (!user || !Array.isArray(user.topicAlerts) || user.topicAlerts.length === 0) {
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
          link: `/?search=${encodeURIComponent(alert.topic)}`,
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

    alert.lastCheckedAt = new Date();
  }

  await user.save();
  return { notificationsCreated: totalNotificationsCreated };
}

async function runAllScheduledAlerts() {
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    const usersWithAlerts = await User.find({
      'topicAlerts.active': true,
    }).select('_id');

    for (const u of usersWithAlerts) {
      await checkAlertsForUser(u._id);
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
