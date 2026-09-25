const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Thesis = require('../models/Thesis');
const Report = require('../models/Report');
const MembershipOrder = require('../models/MembershipOrder');
const PaymentSubmission = require('../models/PaymentSubmission');
const MembershipPeriod = require('../models/MembershipPeriod');
const TrialGrant = require('../models/TrialGrant');
const AuditEvent = require('../models/AuditEvent');
const Notification = require('../models/Notification');
const { addDhakaCalendarMonths, formatDhakaDateTime } = require('../utils/dhakaDate');
const { getPlan } = require('../services/planCatalog');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { emitStudentStatusChanged, emitToUser, emitToAdmins, revokeUserSocketPrivileges } = require('../socket');
const cloudinary = require('cloudinary').v2;

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// All routes here strictly require Admin role
router.use(authenticateToken, requireAdmin);

// GET /api/admin/students
// Returns students roster with active membership statuses
router.get('/students', async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('-password -savedPapers -collections -comparisons -searchHistory')
      .sort({ createdAt: -1 });

    const now = new Date();
    const studentIds = students.map((s) => s._id);

    // Find active membership periods and trials in bulk
    const [activePeriods, activeTrials] = await Promise.all([
      MembershipPeriod.find({
        user: { $in: studentIds },
        status: 'active',
        expiresAt: { $gt: now },
      }),
      TrialGrant.find({
        user: { $in: studentIds },
        status: 'active',
        expiresAt: { $gt: now },
      }),
    ]);

    const periodMap = new Map();
    for (const p of activePeriods) {
      periodMap.set(String(p.user), p);
    }

    const trialMap = new Map();
    for (const t of activeTrials) {
      trialMap.set(String(t.user), t);
    }

    const studentsWithMembership = students.map((s) => {
      const sObj = s.toObject();
      const p = periodMap.get(String(s._id));
      const t = trialMap.get(String(s._id));

      if (p) {
        const planDef = getPlan(p.plan || 'premium_6m');
        sObj.membership = {
          plan: planDef.id,
          label: planDef.name,
          expiresAt: p.expiresAt,
          formattedExpiry: formatDhakaDateTime(p.expiresAt),
        };
      } else if (t) {
        sObj.membership = {
          plan: 'trial',
          label: '7-Day Trial',
          expiresAt: t.expiresAt,
          formattedExpiry: formatDhakaDateTime(t.expiresAt),
        };
      } else {
        sObj.membership = {
          plan: 'free',
          label: 'Standard Free',
          expiresAt: null,
          formattedExpiry: null,
        };
      }
      return sObj;
    });

    return res.json(studentsWithMembership);
  } catch (err) {
    console.error('Error fetching students:', err);
    return res.status(500).json({ message: 'Failed to retrieve students roster.' });
  }
});

// GET /api/admin/students/:id/document
// Authorized admin endpoint to inspect student verification document
router.get('/students/:id/document', async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select('name email idCardProof');
    if (!student || !student.idCardProof) {
      return res.status(404).json({ message: 'No verification document found for this student.' });
    }

    let documentUrl = student.idCardProof;
    if (!documentUrl.startsWith('http://') && !documentUrl.startsWith('https://')) {
      if (hasCloudinary) {
        documentUrl = cloudinary.url(student.idCardProof, {
          secure: true,
          resource_type: 'auto',
          sign_url: true,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
      }
    }

    await AuditEvent.create({
      actor: req.user._id,
      action: 'ADMIN_VIEWED_STUDENT_DOCUMENT',
      targetType: 'User',
      targetId: String(student._id),
      metadata: { studentEmail: student.email, documentRef: student.idCardProof },
      ipAddress: req.ip || '',
    });

    if (req.query.redirect === 'true') {
      return res.redirect(documentUrl);
    }

    return res.json({
      studentId: student._id,
      documentUrl,
      documentRef: student.idCardProof,
    });
  } catch (err) {
    console.error('Error fetching student document:', err);
    return res.status(500).json({ message: 'Failed to retrieve student document.' });
  }
});

// GET /api/admin/pending-students
router.get('/pending-students', async (req, res) => {
  try {
    const pendingStudents = await User.find({ role: 'student', status: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 });

    return res.json(pendingStudents);
  } catch (err) {
    console.error('Error fetching pending students:', err);
    return res.status(500).json({ message: 'Failed to retrieve pending student applications.' });
  }
});

// GET /api/admin/pending-theses
// Returns user-submitted publications pending editorial review
router.get('/pending-theses', async (req, res) => {
  try {
    const pendingTheses = await Thesis.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('submittedBy', 'name email university');

    return res.json(pendingTheses);
  } catch (err) {
    console.error('Error fetching pending theses:', err);
    return res.status(500).json({ message: 'Failed to retrieve pending theses.' });
  }
});

// POST /api/admin/verify-student/:id
router.post('/verify-student/:id', async (req, res) => {
  try {
    const { decision } = req.body; // 'approve' or 'reject'
    const studentId = req.params.id;

    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be either "approve" or "reject".' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student application not found.' });
    }

    student.status = decision === 'approve' ? 'approved' : 'rejected';
    student.verifiedAt = new Date();
    student.verifiedBy = req.user._id;
    await student.save();

    if (decision === 'reject') {
      revokeUserSocketPrivileges(student._id);
    }

    // Broadcast real-time verification to student session & admin consoles
    emitStudentStatusChanged(student._id, {
      status: student.status,
      verifiedAt: student.verifiedAt,
      student: {
        id: student._id,
        _id: student._id,
        name: student.name,
        email: student.email,
        status: student.status,
        university: student.university,
        degreeProgram: student.degreeProgram,
        researchDomain: student.researchDomain,
        idCardProof: student.idCardProof,
      },
    });

    return res.json({
      message: `Student application ${decision === 'approve' ? 'approved' : 'declined'}.`,
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        status: student.status,
        verifiedAt: student.verifiedAt,
      },
    });
  } catch (err) {
    console.error('Error verifying student:', err);
    return res.status(500).json({ message: 'Server error while updating student verification status.' });
  }
});

// POST /api/admin/student/:id/ban
router.post('/student/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    student.status = 'banned';
    student.banReason = reason || 'Administrative suspension';
    await student.save();

    revokeUserSocketPrivileges(student._id);

    // Broadcast real-time suspension
    emitStudentStatusChanged(student._id, {
      status: 'banned',
      reason: student.banReason,
      student: {
        id: student._id,
        _id: student._id,
        name: student.name,
        email: student.email,
        status: 'banned',
        banReason: student.banReason,
      },
    });

    return res.json({
      message: `Student account ${student.name} has been suspended.`,
      student,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to ban student.' });
  }
});

// POST /api/admin/student/:id/unban
router.post('/student/:id/unban', async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    student.status = 'approved';
    student.banReason = '';
    await student.save();

    // Broadcast real-time reinstatement
    emitStudentStatusChanged(student._id, {
      status: 'approved',
      student: {
        id: student._id,
        _id: student._id,
        name: student.name,
        email: student.email,
        status: 'approved',
      },
    });

    return res.json({
      message: `Student account ${student.name} reinstated.`,
      student,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to unban student.' });
  }
});

// DELETE /api/admin/student/:id
router.delete('/student/:id', async (req, res) => {
  try {
    const student = await User.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    revokeUserSocketPrivileges(student._id);

    // Broadcast real-time deletion
    emitStudentStatusChanged(student._id, {
      status: 'deleted',
      studentId: String(student._id),
    });

    return res.json({ message: `Student account for ${student.name} permanently removed.` });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete student account.' });
  }
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [pendingCount, pendingThesesCount, approvedStudents, bannedStudents, totalTheses, totalDatasets] = await Promise.all([
      User.countDocuments({ role: 'student', status: 'pending' }),
      Thesis.countDocuments({ status: 'pending' }),
      User.countDocuments({ role: 'student', status: 'approved' }),
      User.countDocuments({ role: 'student', status: 'banned' }),
      Thesis.countDocuments({ status: 'approved' }),
      Thesis.countDocuments({ datasetUrl: { $ne: '' } }),
    ]);

    return res.json({
      pendingCount,
      pendingThesesCount,
      approvedStudents,
      bannedStudents,
      totalTheses,
      totalDatasets,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to retrieve admin telemetry.' });
  }
});

// GET /api/admin/reports
// Admin queue of metadata inaccuracies and dead-link reports
router.get('/reports', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .populate('resolvedBy', 'name email');
    return res.json(reports);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to retrieve reports queue.' });
  }
});

// PUT /api/admin/reports/:id
// Resolves or dismisses an issue report
router.put('/reports/:id', async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });

    if (status) report.status = status;
    if (adminNotes !== undefined) report.adminNotes = adminNotes;
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();

    await report.save();
    return res.json({ message: 'Report updated.', report });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update report.' });
  }
});

// ==========================================
// Phase 4: bKash Payment Review Queue & Membership Controls
// ==========================================

// GET /api/admin/payments
// Lists payment submissions with filters and search
router.get('/payments', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { trxId: new RegExp(q, 'i') },
        { normalizedTrxId: new RegExp(q.toUpperCase(), 'i') },
        { senderNumber: new RegExp(q, 'i') },
      ];
    }

    const submissions = await PaymentSubmission.find(filter)
      .populate('user', 'name email university studentId status')
      .populate('order', 'orderRef plan planCode planName pricePaisa durationMonths createdAt')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 });

    return res.json(submissions);
  } catch (err) {
    console.error('Error fetching payment queue:', err);
    return res.status(500).json({ message: 'Failed to retrieve payments queue.' });
  }
});

// POST /api/admin/payments/:id/approve
// Atomic verification and approval with idempotent replay guard and non-destructive renewal chaining
router.post('/payments/:id/approve', async (req, res) => {
  try {
    const adminNotes = (req.body?.adminNotes || req.body?.adminInstructions || req.body?.notes || '').trim();

    // 1. Strict boolean merchant statement verification
    const isStatementVerified = req.body.verifiedInMerchantStatement === true ||
      req.body.merchantStatementVerified === true ||
      req.body.verifiedAgainstStatement === true;

    if (!isStatementVerified) {
      return res.status(400).json({
        message: 'Editorial verification requirement: You must confirm the transaction was reconciled against the bKash merchant statement with verifiedInMerchantStatement=true.',
        code: 'STATEMENT_VERIFICATION_REQUIRED',
      });
    }

    // 2. Check existing state
    const existingSubmission = await PaymentSubmission.findById(req.params.id)
      .populate('user', 'name email')
      .populate('order');

    if (!existingSubmission) {
      return res.status(404).json({ message: 'Payment submission not found.' });
    }

    // 3. Idempotency Guard:
    // A payment creates exactly one historical grant. Existence of an approved submission returns
    // the original durable outcome without extending, reactivating old cancelled/expired periods, or re-notifying.
    if (existingSubmission.status === 'approved') {
      const existingPeriod = await MembershipPeriod.findOne({
        paymentSubmission: existingSubmission._id,
      });

      return res.status(200).json({
        message: 'Payment submission was already approved; returning existing membership record without modifications.',
        submission: existingSubmission,
        period: existingPeriod || null,
        isReplay: true,
      });
    }

    if (!['submitted', 'under_review'].includes(existingSubmission.status)) {
      return res.status(409).json({
        message: `Payment submission cannot be approved from current status '${existingSubmission.status}'.`,
      });
    }

    const previousStatus = existingSubmission.status;

    // 4. Resolve Plan & Order Snapshot
    const order = existingSubmission.order;
    const durationMonths = order?.durationMonths || 6;
    const planCode = order?.planCode || order?.plan || 'premium_6m';
    const planDef = getPlan(planCode);
    const planName = order?.planName || planDef.name;
    const amountBdt = order?.pricePaisa ? (order.pricePaisa / 100) : (planDef.price || 500);

    // 5. Atomic conditional status transition on payment submission
    const submission = await PaymentSubmission.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['submitted', 'under_review'] } },
      {
        status: 'approved',
        adminInstructions: adminNotes || existingSubmission.adminInstructions || '',
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { new: true }
    )
      .populate('user', 'name email')
      .populate('order');

    if (!submission) {
      // Concurrency race: check if another thread just approved it
      const raceCheck = await PaymentSubmission.findById(req.params.id);
      if (raceCheck?.status === 'approved') {
        const racePeriod = await MembershipPeriod.findOne({ paymentSubmission: raceCheck._id });
        return res.status(200).json({
          message: 'Payment submission was concurrently approved; returning existing membership record.',
          submission: raceCheck,
          period: racePeriod,
          isReplay: true,
        });
      }
      return res.status(409).json({ message: 'Payment status transition conflict.' });
    }

    const userId = submission.user._id;
    const now = new Date();

    // 6. Renewal Chaining Calculation
    // Find active paid periods (excluding any tied to this submission)
    const activePaid = await MembershipPeriod.findOne({
      user: userId,
      status: 'active',
      expiresAt: { $gt: now },
      paymentSubmission: { $ne: submission._id },
    }).sort({ expiresAt: -1 });

    let startsAt = now;
    let newExpiresAt;

    if (activePaid) {
      // Active Renewal: append purchased duration strictly after current coverage without losing days
      // Existing coverage is NEVER marked expired prematurely; it remains active through its original expiry
      startsAt = activePaid.expiresAt;
      newExpiresAt = addDhakaCalendarMonths(activePaid.expiresAt, durationMonths);
    } else {
      // New or Expired user: starts immediately
      startsAt = now;
      newExpiresAt = addDhakaCalendarMonths(now, durationMonths);
    }

    // 7. Convert any active trial to converted
    await TrialGrant.updateMany(
      { user: userId, status: 'active' },
      { status: 'converted' }
    );

    // 8. Create or reconcile the MembershipPeriod
    let period;
    try {
      period = await MembershipPeriod.findOne({ paymentSubmission: submission._id });
      if (!period) {
        period = new MembershipPeriod({
          user: userId,
          order: submission.order?._id || null,
          paymentSubmission: submission._id,
          plan: planDef.code,
          startsAt,
          expiresAt: newExpiresAt,
          status: 'active',
        });
        await period.save();
      }
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        period = await MembershipPeriod.findOne({ paymentSubmission: submission._id });
      } else {
        // Durable compensation: rollback submission status if period creation failed
        await PaymentSubmission.findByIdAndUpdate(submission._id, {
          status: previousStatus,
          reviewedAt: null,
          reviewedBy: null,
        });
        throw saveErr;
      }
    }

    // 9. Update order status to completed
    if (submission.order) {
      await MembershipOrder.findByIdAndUpdate(submission.order._id, { status: 'completed' });
    }

    // 10. Log immutable audit event with snapshot data
    await AuditEvent.create({
      actor: req.user._id,
      action: 'payment.approved',
      targetType: 'PaymentSubmission',
      targetId: String(submission._id),
      metadata: {
        userId: String(userId),
        trxId: submission.normalizedTrxId,
        planCode: planDef.code,
        pricePaisa: order?.pricePaisa || planDef.pricePaisa,
        durationMonths,
        startsAt,
        expiresAt: newExpiresAt,
        renewal: Boolean(activePaid),
      },
      ipAddress: req.ip || '',
    });

    // 11. In-app Notification using snapshot terms
    const notif = new Notification({
      user: userId,
      type: 'payment_approved',
      title: `bKash Payment Approved — ${planDef.label} Activated`,
      message: `Your bKash transaction ${submission.trxId} (৳${amountBdt}) has been verified. ${planDef.label} is active through ${formatDhakaDateTime(newExpiresAt)}.`,
    });
    await notif.save();

    // 12. Real-time WebSocket dispatch
    emitToUser(String(userId), 'notification:new', notif);
    emitToUser(String(userId), 'membership:updated', {
      plan: planDef.code,
      expiresAt: newExpiresAt,
      formattedExpiry: formatDhakaDateTime(newExpiresAt),
    });
    emitToAdmins('admin:payment_updated', {
      submissionId: String(submission._id),
      status: 'approved',
    });
    emitToAdmins('admin:student_updated', {
      studentId: String(userId),
    });

    return res.json({
      message: `bKash payment successfully verified. ${planDef.label} activated.`,
      submission,
      period,
      formattedExpiry: formatDhakaDateTime(newExpiresAt),
    });
  } catch (err) {
    console.error('Approve payment error:', err);
    return res.status(500).json({ message: 'Failed to approve payment.' });
  }
});

// POST /api/admin/payments/:id/reject
// Rejects a claimed payment with mandatory reason
router.post('/payments/:id/reject', async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ message: 'A mandatory rejection reason must be recorded.' });
    }

    const submission = await PaymentSubmission.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['submitted', 'under_review'] } },
      {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { new: true }
    );

    if (!submission) {
      return res.status(404).json({ message: 'Payment submission not found or already processed.' });
    }

    await AuditEvent.create({
      actor: req.user._id,
      action: 'payment.rejected',
      targetType: 'PaymentSubmission',
      targetId: String(submission._id),
      metadata: { rejectionReason: rejectionReason.trim() },
      ipAddress: req.ip || '',
    });

    // In-app Notification
    const notif = new Notification({
      user: submission.user,
      type: 'payment_rejected',
      title: 'bKash Payment Verification Notice',
      message: `Your bKash transaction claim ${submission.trxId} could not be verified: "${rejectionReason.trim()}". You may review details in your payment history.`,
    });
    await notif.save();
    emitToUser(String(submission.user), 'notification:new', notif);
    emitToAdmins('admin:payment_updated', {
      submissionId: String(submission._id),
      status: 'rejected',
    });

    return res.json({ message: 'Payment claim rejected.', submission });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to reject payment.' });
  }
});

// POST /api/admin/payments/:id/request-correction
// Requests the user to correct a mistyped transaction ID
router.post('/payments/:id/request-correction', async (req, res) => {
  try {
    const { adminInstructions } = req.body;
    if (!adminInstructions || !adminInstructions.trim()) {
      return res.status(400).json({ message: 'Correction instructions are required.' });
    }

    const submission = await PaymentSubmission.findByIdAndUpdate(
      req.params.id,
      {
        status: 'under_review',
        adminInstructions: adminInstructions.trim(),
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { new: true }
    );

    if (!submission) return res.status(404).json({ message: 'Payment submission not found.' });

    await AuditEvent.create({
      actor: req.user._id,
      action: 'payment.correction_requested',
      targetType: 'PaymentSubmission',
      targetId: String(submission._id),
      metadata: { adminInstructions: adminInstructions.trim() },
      ipAddress: req.ip || '',
    });

    const notif = new Notification({
      user: submission.user,
      type: 'payment_correction',
      title: 'bKash Payment Correction Requested',
      message: `Admin review requested an update on transaction ${submission.trxId}: "${adminInstructions.trim()}".`,
    });
    await notif.save();
    emitToUser(String(submission.user), 'notification:new', notif);
    emitToAdmins('admin:payment_updated', {
      submissionId: String(submission._id),
      status: 'under_review',
    });

    return res.json({ message: 'Correction instructions dispatched to student.', submission });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to request correction.' });
  }
});

// POST /api/admin/membership/:userId/cancel
// Admin can cancel an active membership with mandatory reason (Per user requirement)
router.post('/membership/:userId/cancel', async (req, res) => {
  try {
    const { cancellationReason } = req.body;
    if (!cancellationReason || !cancellationReason.trim()) {
      return res.status(400).json({ message: 'Mandatory cancellation reason is required.' });
    }

    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Cancel all active periods
    const periods = await MembershipPeriod.find({ user: userId, status: 'active' });
    for (const p of periods) {
      p.status = 'cancelled';
      p.cancelledAt = new Date();
      p.cancelledBy = req.user._id;
      p.cancellationReason = cancellationReason.trim();
      await p.save();
    }

    // Expire active trials
    await TrialGrant.updateMany(
      { user: userId, status: 'active' },
      { status: 'expired' }
    );

    await AuditEvent.create({
      actor: req.user._id,
      action: 'membership.cancelled',
      targetType: 'User',
      targetId: String(userId),
      metadata: { cancellationReason: cancellationReason.trim(), cancelledPeriodsCount: periods.length },
      ipAddress: req.ip || '',
    });

    const notif = new Notification({
      user: userId,
      type: 'membership_cancelled',
      title: 'Membership Status Notice',
      message: `Your membership has been terminated by depository administration: "${cancellationReason.trim()}". Your existing research library and data remain preserved.`,
    });
    await notif.save();
    emitToUser(String(userId), 'notification:new', notif);
    emitToUser(String(userId), 'membership:updated', { plan: 'free', expiresAt: null });
    emitToAdmins('admin:student_updated', { studentId: String(userId) });

    return res.json({
      message: `Membership cancelled for ${user.name}.`,
      cancelledPeriods: periods.length,
    });
  } catch (err) {
    console.error('Cancel membership error:', err);
    return res.status(500).json({ message: 'Failed to cancel membership.' });
  }
});

module.exports = router;
