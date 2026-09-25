const User = require('../models/User');
const Thesis = require('../models/Thesis');
const Notification = require('../models/Notification');
const { getEffectiveEntitlements } = require('./entitlementService');
const { emitToUser } = require('../socket');

let isRunning = false;

/**
 * Evaluates topic alerts for a specific user.
 * Searches for newly approved publications matching the topic keyword.
 * Generates deduplicated in-app notifications and records the lastCheckedAt timestamp.
 */
async function checkAlertsForUser(userId) {
  const user = await User.findById(userId);
  if (!user || !Array.isArray(user.topicAlerts) || user.topicAlerts.length === 0) {
    return { notificationsCreated: 0 };
  }

  // Check active entitlements at runtime:
  // (e.g., Free accounts: 0 alerts, Trial v2: 1 alert, Premium: 10 alerts).
  // Preserves existing alerts in user.topicAlerts after expiry or downgrade.
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
      // Evaluate only up to allowed quota (1 for trial, 10 for premium), preserving any extra alerts in DB
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

    // Complete batch scanning with watermark ordering (no arbitrary 5-paper cutoff)
    const matchingTheses = await Thesis.find(filter)
      .sort({ approvedAt: 1, updatedAt: 1, createdAt: 1 })
      .lean();

    if (matchingTheses.length > 0) {
      // Per-paper deduplication check so one already-notified paper does not suppress other new papers
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

        // Real-time dispatch if user is online
        emitToUser(String(user._id), 'notification:new', newNotif);
      }
    }

    // Record last checked time
    alert.lastCheckedAt = new Date();
  }

  await user.save();
  return { notificationsCreated: totalNotificationsCreated };
}

/**
 * Scheduled runner: scans all users with active alerts
 * Protected by concurrency lock to prevent overlapping runs
 */
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
