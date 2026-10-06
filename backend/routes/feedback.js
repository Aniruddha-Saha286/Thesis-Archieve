const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Feedback = require('../models/Feedback');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, PERMISSIONS } = require('../middleware/rbac');
const { adminActionLimiter } = require('../middleware/rateLimit');
// Kept as one object (not pulled apart into separate names) so the tests can watch what is
// pushed to browsers without starting a real socket server.
const realtime = require('../socket');
const emailService = require('../services/emailService');
const {
  FEEDBACK_STATUSES,
  FEEDBACK_CATEGORY_LABELS,
  normalizeFeedbackCategory,
  isValidFeedbackStatus,
  cleanFeedbackMessage,
  cleanFeedbackReply,
  cleanPageContext,
  feedbackPreview,
  parseFeedbackListQuery,
} = require('../utils/feedbackFields');

// Every endpoint in this file needs a signed-in account. Banned accounts are stopped here.
// There is deliberately no "approved only" check on the user endpoints: students who are still
// waiting for approval (status "pending") or were turned down ("rejected") are the people
// most likely to need help, so they must be able to write to the team.
router.use(authenticateToken);

// How many of a user's own messages are returned at once.
const MY_FEEDBACK_LIMIT = 50;

// Safety cap on how many admin accounts get a stored notification for one message.
const MAX_ADMIN_RECIPIENTS = 10;

// 5 messages per 10 minutes for each account.
// - Counted per user id, not per IP address, so students sharing a campus network do not use up
//   each other's allowance, and one person cannot get more by switching networks.
// - Only messages that were accepted are counted. A message refused for being too short, or a
//   server problem, does not use up the allowance.
const feedbackSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `feedback:${req.user ? String(req.user._id) : 'unknown'}`,
  skipFailedRequests: true,
  message: {
    message: 'You have sent several messages in a short time. Please wait a few minutes and try again.',
  },
});

// A malformed id must give "not found", not a server error from the database driver.
function isValidId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

// Starts an email without waiting for it. Whatever goes wrong is only logged, so email
// trouble can never fail or slow down the request that triggered it.
function sendEmailInBackground(label, start) {
  try {
    Promise.resolve(start()).catch((err) => console.error(label, err && err.message));
  } catch (err) {
    console.error(label, err && err.message);
  }
}

// Tells staff that a new message arrived, the same way a new report does:
// a stored notification for the admin account(s), pushed live to them, plus a live push to
// every signed-in admin. Editors who hold the reports permission also handle feedback, so
// they get the same live push. A failure here is logged only; the message itself is already saved.
async function notifyStaffOfNewFeedback(feedback) {
  try {
    const label = FEEDBACK_CATEGORY_LABELS[feedback.category] || FEEDBACK_CATEGORY_LABELS.other;
    const sender = feedback.userName || feedback.userEmail || 'A user';
    const notifPayload = {
      type: 'feedback_new',
      title: 'New feedback from a user',
      message: `${sender} wrote (${label}): "${feedbackPreview(feedback.message)}"`,
      data: { feedbackId: String(feedback._id), category: feedback.category },
    };

    const adminUsers = await User.find({ role: 'admin' }).select('_id').limit(MAX_ADMIN_RECIPIENTS);
    for (const adminUser of adminUsers || []) {
      const adminNotif = new Notification({ user: adminUser._id, ...notifPayload });
      await adminNotif.save();
      realtime.emitToUser(String(adminUser._id), 'notification:new', adminNotif);
    }
    realtime.emitToAdmins('notification:new', notifPayload);

    // Editors with the reports permission. Admins are left out here because they were just told above.
    const io = realtime.getIO();
    if (io) {
      io.to(`perm:${PERMISSIONS.REPORTS_MODERATE}`).except('role:admin').emit('notification:new', notifPayload);
    }
  } catch (notifErr) {
    console.error('[Feedback] Staff notification error:', notifErr.message);
  }
}

// Tells the user that the team replied: a stored notification, pushed live if they are online.
// A failure here is logged only; the reply itself is already saved.
async function notifyUserOfReply(feedback) {
  try {
    const notif = new Notification({
      user: feedback.user,
      type: 'feedback_reply',
      title: 'Reply to your feedback',
      message: feedbackPreview(feedback.adminReply),
      data: { feedbackId: String(feedback._id) },
    });
    await notif.save();
    realtime.emitToUser(String(feedback.user), 'notification:new', notif);
  } catch (notifErr) {
    console.error('[Feedback] Reply notification error:', notifErr.message);
  }
}

// ==========================================
// 1. User Endpoints (any signed-in account)
// ==========================================

// POST /api/feedback
// Send a message to the team.
router.post('/', feedbackSubmitLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const cleaned = cleanFeedbackMessage(body.message);
    if (!cleaned.ok) {
      return res.status(400).json({ message: cleaned.error });
    }

    const feedback = new Feedback({
      user: req.user._id,
      userEmail: req.user.email || '',
      userName: req.user.name || '',
      category: normalizeFeedbackCategory(body.category),
      message: cleaned.value,
      pageContext: cleanPageContext(body.pageContext),
      status: 'new',
    });
    await feedback.save();

    sendEmailInBackground('[EmailService] Feedback notification error:', () =>
      emailService.notifyAdminNewFeedback({
        feedbackId: feedback._id,
        category: feedback.category,
        categoryLabel: FEEDBACK_CATEGORY_LABELS[feedback.category],
        message: feedback.message,
        pageContext: feedback.pageContext,
        userName: feedback.userName,
        userEmail: feedback.userEmail,
      })
    );

    await notifyStaffOfNewFeedback(feedback);

    return res.status(201).json({
      message: 'Thank you. Your message has been sent to the team.',
      feedback,
    });
  } catch (err) {
    console.error('[Feedback] Submit error:', err);
    return res.status(500).json({ message: 'Failed to send your message. Please try again.' });
  }
});

// GET /api/feedback/mine
// The signed-in user's own messages and any replies, newest first.
router.get('/mine', async (req, res) => {
  try {
    const feedback = await Feedback.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(MY_FEEDBACK_LIMIT);
    return res.json({ feedback });
  } catch (err) {
    console.error('[Feedback] Failed to retrieve own feedback:', err);
    return res.status(500).json({ message: 'Failed to load your messages.' });
  }
});

// ==========================================
// 2. Staff Endpoints (admins, and editors who handle reports)
// ==========================================
// These are declared before PUT /:id/seen so that a path starting with /admin is always
// treated as a staff request and checked for the staff permission.

// GET /api/feedback/admin?status=&category=&page=&limit=
// The team's queue. status=open means new + in_progress.
router.get('/admin', requirePermission(PERMISSIONS.REPORTS_MODERATE), async (req, res) => {
  try {
    const { statuses, category, page, limit } = parseFeedbackListQuery(req.query);

    const filter = {};
    if (statuses) filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    if (category) filter.category = category;

    // The per-status totals follow the category filter but not the status filter, so the
    // numbers on the status tabs stay the same while staff switch between tabs.
    const countBase = category ? { category } : {};

    const [feedback, total, ...statusTotals] = await Promise.all([
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Feedback.countDocuments(filter),
      ...FEEDBACK_STATUSES.map((status) => Feedback.countDocuments({ ...countBase, status })),
    ]);

    const counts = {};
    FEEDBACK_STATUSES.forEach((status, index) => {
      counts[status] = statusTotals[index] || 0;
    });

    return res.json({
      feedback,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
      counts,
    });
  } catch (err) {
    console.error('[Feedback] Failed to retrieve feedback queue:', err);
    return res.status(500).json({ message: 'Failed to load the feedback queue.' });
  }
});

// PUT /api/feedback/admin/:id
// Change the status, write a reply, or both. A reply marks the message "answered" unless a
// status is sent with it, and the user is told in the app and by email.
router.put('/admin/:id', requirePermission(PERMISSIONS.REPORTS_MODERATE), adminActionLimiter, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    const body = req.body || {};
    // An empty status, or a reply box left empty, means "leave that part as it is".
    const hasStatus = body.status !== undefined && body.status !== null && body.status !== '';
    const hasReply =
      body.reply !== undefined && body.reply !== null && !(typeof body.reply === 'string' && !body.reply.trim());

    if (!hasStatus && !hasReply) {
      return res.status(400).json({ message: 'Please choose a status or write a reply.' });
    }
    if (hasStatus && !isValidFeedbackStatus(body.status)) {
      return res.status(400).json({ message: 'Status must be new, in_progress, answered or closed.' });
    }

    let reply = null;
    if (hasReply) {
      reply = cleanFeedbackReply(body.reply);
      if (!reply.ok) {
        return res.status(400).json({ message: reply.error });
      }
    }

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ message: 'Feedback not found.' });

    if (reply) {
      feedback.adminReply = reply.value;
      feedback.repliedBy = req.user._id;
      feedback.repliedByName = req.user.name || '';
      feedback.repliedAt = new Date();
      // A new or edited reply is unread again for the user.
      feedback.userSeenReply = false;
      feedback.status = hasStatus ? body.status : 'answered';
    } else {
      feedback.status = body.status;
    }

    await feedback.save();

    if (reply) {
      await notifyUserOfReply(feedback);

      sendEmailInBackground('[EmailService] Feedback reply email error:', () =>
        emailService.notifyUserFeedbackReply({
          userEmail: feedback.userEmail,
          userName: feedback.userName,
          categoryLabel: FEEDBACK_CATEGORY_LABELS[feedback.category],
          originalMessage: feedback.message,
          reply: feedback.adminReply,
        })
      );
    }

    return res.json({
      message: reply ? 'Reply sent to the user.' : 'Feedback updated.',
      feedback,
    });
  } catch (err) {
    console.error('[Feedback] Update error:', err);
    return res.status(500).json({ message: 'Failed to update feedback.' });
  }
});

// ==========================================
// 3. User Endpoint: mark a reply as read
// ==========================================

// PUT /api/feedback/:id/seen
// Marks the reply on one of the caller's own messages as read.
router.put('/:id/seen', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    // Matching on the owner as well as the id means somebody else's message is simply "not found".
    // timestamps: false keeps "last updated" meaning the last real change, not the last time it was read.
    const feedback = await Feedback.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { userSeenReply: true },
      { returnDocument: 'after', timestamps: false }
    );
    if (!feedback) return res.status(404).json({ message: 'Feedback not found.' });

    return res.json({ message: 'Reply marked as read.', feedback });
  } catch (err) {
    console.error('[Feedback] Mark seen error:', err);
    return res.status(500).json({ message: 'Failed to update your message.' });
  }
});

module.exports = router;
// Exposed so tests can clear the per-user counter between cases.
module.exports.feedbackSubmitLimiter = feedbackSubmitLimiter;
