const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Thesis = require('../models/Thesis');
const Report = require('../models/Report');
const Feedback = require('../models/Feedback');
const thesisFileStorage = require('../services/thesisFileStorage');
const MembershipOrder = require('../models/MembershipOrder');
const PaymentSubmission = require('../models/PaymentSubmission');
const MembershipPeriod = require('../models/MembershipPeriod');
const TrialGrant = require('../models/TrialGrant');
const AuditEvent = require('../models/AuditEvent');
const Notification = require('../models/Notification');
const { addDhakaCalendarMonths, formatDhakaDateTime } = require('../utils/dhakaDate');
const { getPlan } = require('../services/planCatalog');
const { authenticateToken } = require('../middleware/auth');
const {
  requirePermission,
  requireAdmin,
  requireStaff,
  PERMISSIONS,
  ALL_PERMISSIONS,
} = require('../middleware/rbac');
const { adminActionLimiter, paymentActionLimiter } = require('../middleware/rateLimit');
const {
  emitStudentStatusChanged,
  emitToUser,
  emitToAdmins,
  revokeUserSocketPrivileges,
  syncUserSocketRooms,
  emitThesisUpdated,
} = require('../socket');
const {
  toSanitizedUserDto,
  getValidatedPrimaryAdminEmail,
} = require('../services/googleIdentityService');
const emailService = require('../services/emailService');
const { escapeRegex } = require('../utils/escapeRegex');
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

// All admin routes require a verified authenticated session.
// Granular capability permissions are attached to each route.
router.use(authenticateToken);

// ==========================================
// 1. Student Roster & Management Endpoints
// ==========================================

// GET /api/admin/students
// Returns sanitized student roster with canonical plan codes and membership status
router.get('/students', requirePermission(PERMISSIONS.STUDENTS_VIEW), async (req, res) => {
  try {
    const students = await User.find({ role: { $in: ['student', 'editor'] } })
      .select('-password -savedPapers -collections -comparisons -searchHistory')
      .sort({ createdAt: -1 });

    const now = new Date();
    const studentIds = students.map((s) => s._id);

    // Fetch active periods and active trials in bulk
    const [activePeriods, activeTrials] = await Promise.all([
      MembershipPeriod.find({
        user: { $in: studentIds },
        status: 'active',
        expiresAt: { $gt: now },
      }).sort({ expiresAt: -1 }),
      TrialGrant.find({
        user: { $in: studentIds },
        status: 'active',
        expiresAt: { $gt: now },
      }),
    ]);

    const periodMap = new Map();
    for (const p of activePeriods) {
      if (!periodMap.has(String(p.user))) {
        periodMap.set(String(p.user), p);
      }
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
        const isManual = p.source === 'manual_admin';
        const effectiveLabel = isManual
          ? (p.customLabel || (p.plan === 'pro_max_12m' ? 'Pro Max Research Grant' : 'Premium Research Grant'))
          : (planDef.label || planDef.name);

        sObj.membership = {
          periodId: p._id,
          plan: planDef.code,
          planCode: planDef.code,
          label: effectiveLabel,
          expiresAt: p.expiresAt,
          formattedExpiry: formatDhakaDateTime(p.expiresAt),
          source: p.source || 'payment',
          customLabel: p.customLabel || '',
          grantType: p.grantType || 'standard',
          grantReason: p.grantReason || '',
        };
      } else if (t) {
        sObj.membership = {
          plan: 'trial_v2',
          planCode: 'trial_v2',
          label: '7-Day Research Trial',
          expiresAt: t.expiresAt,
          formattedExpiry: formatDhakaDateTime(t.expiresAt),
          source: 'trial',
        };
      } else {
        sObj.membership = {
          plan: 'free',
          planCode: 'free',
          label: 'Standard Free',
          expiresAt: null,
          formattedExpiry: null,
          source: 'default',
        };
      }

      // SECURITY: Expose only hasVerificationDocument boolean, never raw storage reference
      sObj.hasVerificationDocument = Boolean(sObj.idCardProof);
      delete sObj.idCardProof;
      delete sObj.googleId;
      delete sObj.password;

      return sObj;
    });

    return res.json(studentsWithMembership);
  } catch (err) {
    console.error('Error fetching students:', err);
    return res.status(500).json({ message: 'Failed to retrieve students roster.' });
  }
});

// GET /api/admin/pending-students
// Returns students awaiting registration verification
router.get('/pending-students', requirePermission(PERMISSIONS.STUDENTS_VIEW), async (req, res) => {
  try {
    // Only students who finished the registration form belong in the review queue
    const pendingStudents = await User.find({ role: 'student', status: 'pending', isProfileComplete: true })
      .select('-password -savedPapers -collections -comparisons -searchHistory')
      .sort({ createdAt: -1 });

    const sanitized = pendingStudents.map((s) => {
      const sObj = s.toObject();
      sObj.hasVerificationDocument = Boolean(sObj.idCardProof);
      delete sObj.idCardProof;
      delete sObj.googleId;
      return sObj;
    });

    return res.json(sanitized);
  } catch (err) {
    console.error('Error fetching pending students:', err);
    return res.status(500).json({ message: 'Failed to retrieve pending student applications.' });
  }
});

// GET /api/admin/students/:id/document
// Protected endpoint for staff with documents.view permission to inspect student ID proof
// Returns a short-lived (10-minute) signed URL or secure response. Never exposes permanent raw storage keys.
router.get('/students/:id/document', requirePermission(PERMISSIONS.DOCUMENTS_VIEW), async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('name email idCardProof');
    if (!student || !student.idCardProof) {
      return res.status(404).json({ message: 'No verification document found for this student.' });
    }

    let documentUrl = student.idCardProof;
    const isDirectHttp = documentUrl.startsWith('http://') || documentUrl.startsWith('https://');

    if (!isDirectHttp && hasCloudinary) {
      const isPdf = student.idCardProof.endsWith('.pdf');
      const resourceType = isPdf ? 'raw' : 'image';

      documentUrl = cloudinary.url(student.idCardProof, {
        secure: true,
        resource_type: resourceType,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 600, // 10 minutes
      });
    } else if (isDirectHttp) {
      // Validate domain against trusted cloud providers only
      const parsed = new URL(documentUrl);
      const isTrustedCloud = parsed.hostname.endsWith('cloudinary.com') ||
        parsed.hostname.endsWith('res.cloudinary.com') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1';
      if (!isTrustedCloud) {
        return res.status(403).json({ message: 'Stored document reference points to an unauthorized host.' });
      }
    }

    // Set secure anti-caching and no-sniff headers
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Audit document access without logging storage keys or credentials
    await AuditEvent.create({
      actor: req.user._id,
      action: 'ADMIN_VIEWED_STUDENT_DOCUMENT',
      targetType: 'User',
      targetId: String(student._id),
      metadata: { studentEmail: student.email },
      ipAddress: req.ip || '',
    });

    if (req.query.redirect === 'true') {
      return res.redirect(documentUrl);
    }

    return res.json({
      studentId: student._id,
      documentUrl,
      expiresInSeconds: 600,
    });
  } catch (err) {
    console.error('Error fetching student document:', err);
    return res.status(500).json({ message: 'Failed to retrieve student document.' });
  }
});

// POST /api/admin/verify-student/:id
// Approves or rejects student verification
router.post('/verify-student/:id', requirePermission(PERMISSIONS.STUDENTS_VERIFY), adminActionLimiter, async (req, res) => {
  try {
    const { decision } = req.body;
    const studentId = req.params.id;

    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be either "approve" or "reject".' });
    }

    // Target mutation safety: ensure target is strictly role: 'student' and not self
    if (String(req.user._id) === String(studentId)) {
      return res.status(400).json({ message: 'Self-modification is prohibited.' });
    }

    const student = await User.findOne({ _id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student application not found or target is not a student.' });
    }

    if (decision === 'approve' && !student.isProfileComplete) {
      return res.status(400).json({
        message: 'This student has not finished the registration form yet, so there is nothing to verify. Approval becomes available once they submit it.',
        code: 'PROFILE_INCOMPLETE',
      });
    }

    student.status = decision === 'approve' ? 'approved' : 'rejected';
    student.verifiedAt = new Date();
    student.verifiedBy = req.user._id;
    await student.save();

    if (decision === 'reject') {
      revokeUserSocketPrivileges(student._id);
    }

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
        hasVerificationDocument: Boolean(student.idCardProof),
      },
    });

    if (decision === 'approve') {
      try {
        const studentNotif = new Notification({
          user: student._id,
          type: 'verification_approved',
          title: 'Student Identity Verified',
          message: 'Your student researcher credentials have been officially approved by the depository administration.',
        });
        await studentNotif.save();
        emitToUser(String(student._id), 'notification:new', studentNotif);
      } catch (notifErr) {
        console.error('[Admin] Student notification error:', notifErr.message);
      }

      emailService.notifyUserVerificationApproved({
        userEmail: student.email,
        userName: student.name,
        university: student.university,
        degreeProgram: student.degreeProgram,
      }).catch((err) => console.error('[EmailService] Verification approval notification error:', err.message));
    }

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
// Suspends a student account
router.post('/student/:id/ban', requirePermission(PERMISSIONS.STUDENTS_SUSPEND), adminActionLimiter, async (req, res) => {
  try {
    const { reason } = req.body;
    const studentId = req.params.id;

    if (String(req.user._id) === String(studentId)) {
      return res.status(400).json({ message: 'Self-suspension is prohibited.' });
    }

    // Target mutation safety: strictly student
    const student = await User.findOne({ _id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or account is not an eligible student target.' });
    }

    student.status = 'banned';
    student.banReason = (reason || 'Administrative suspension').trim();
    await student.save();

    revokeUserSocketPrivileges(student._id);

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
      student: {
        id: student._id,
        name: student.name,
        status: student.status,
        banReason: student.banReason,
      },
    });
  } catch (err) {
    console.error('[routes/admin.js] Failed to ban student:', err);
    return res.status(500).json({ message: 'Failed to ban student.' });
  }
});

// POST /api/admin/student/:id/unban
// Reinstates a student account
router.post('/student/:id/unban', requirePermission(PERMISSIONS.STUDENTS_SUSPEND), adminActionLimiter, async (req, res) => {
  try {
    const studentId = req.params.id;
    if (String(req.user._id) === String(studentId)) {
      return res.status(400).json({ message: 'Self-modification is prohibited.' });
    }

    const student = await User.findOne({ _id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or target is not a student.' });
    }

    student.status = 'approved';
    student.banReason = '';
    await student.save();

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
      student: {
        id: student._id,
        name: student.name,
        status: student.status,
      },
    });
  } catch (err) {
    console.error('[routes/admin.js] Failed to unban student:', err);
    return res.status(500).json({ message: 'Failed to unban student.' });
  }
});

// DELETE /api/admin/student/:id
// Admin only: Permanently deletes a student account
router.delete('/student/:id', requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const studentId = req.params.id;
    if (String(req.user._id) === String(studentId)) {
      return res.status(400).json({ message: 'Deleting your own administrator account is prohibited.' });
    }

    const student = await User.findOneAndDelete({ _id: studentId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found or account is not an eligible student target.' });
    }

    revokeUserSocketPrivileges(student._id);

    emitStudentStatusChanged(student._id, {
      status: 'deleted',
      studentId: String(student._id),
    });

    return res.json({ message: `Student account for ${student.name} permanently removed.` });
  } catch (err) {
    console.error('[routes/admin.js] Failed to delete student account:', err);
    return res.status(500).json({ message: 'Failed to delete student account.' });
  }
});

// GET /api/admin/stats
// Returns administrative telemetry (staff authorization required)
router.get('/stats', requireStaff, async (req, res) => {
  try {
    const [pendingCount, pendingThesesCount, approvedStudents, bannedStudents, totalTheses, totalDatasets, totalEditors, pendingPaymentsCount, pendingReportsCount, newFeedbackCount] = await Promise.all([
      User.countDocuments({ role: 'student', status: 'pending', isProfileComplete: true }),
      Thesis.countDocuments({ status: 'pending' }),
      User.countDocuments({ role: 'student', status: 'approved' }),
      User.countDocuments({ role: 'student', status: 'banned' }),
      Thesis.countDocuments({ status: 'approved' }),
      Thesis.countDocuments({ datasetUrl: { $nin: ['', null] } }),
      User.countDocuments({ role: 'editor' }),
      PaymentSubmission.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
      Report.countDocuments({ status: 'pending' }),
      Feedback.countDocuments({ status: 'new' }),
    ]);

    return res.json({
      pendingCount,
      pendingThesesCount,
      approvedStudents,
      bannedStudents,
      totalTheses,
      totalDatasets,
      totalEditors,
      pendingPaymentsCount,
      pendingReportsCount,
      newFeedbackCount,
    });
  } catch (err) {
    console.error('[routes/admin.js] Failed to retrieve admin telemetry:', err);
    return res.status(500).json({ message: 'Failed to retrieve admin telemetry.' });
  }
});

// ==========================================
// 2. Team & Access (Editor RBAC Management) - Admin Only
// ==========================================

// GET /api/admin/editors
// Lists all staff members (primary admin and appointed editors)
router.get('/editors', requireAdmin, async (req, res) => {
  try {
    const staff = await User.find({ role: { $in: ['admin', 'editor'] } })
      .select('-password -savedPapers -collections -comparisons -searchHistory')
      .populate('roleChangedBy', 'name email')
      .sort({ role: 1, createdAt: 1 });

    const sanitized = staff.map(toSanitizedUserDto);
    return res.json(sanitized);
  } catch (err) {
    console.error('Error fetching staff list:', err);
    return res.status(500).json({ message: 'Failed to retrieve staff members.' });
  }
});

// POST /api/admin/editors
// Appoints an existing verified Google user as an editor with specified permissions
router.post('/editors', requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const { email, permissions } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'User email is required to appoint an editor.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const primaryAdminEmail = getValidatedPrimaryAdminEmail();

    if (primaryAdminEmail && cleanEmail === primaryAdminEmail) {
      return res.status(400).json({ message: 'The primary administrator account cannot be converted to an editor.' });
    }

    const requestedPerms = Array.isArray(permissions) ? permissions : [];
    const validPerms = requestedPerms.filter((p) => ALL_PERMISSIONS.includes(p));

    let targetUser = await User.findOne({ email: cleanEmail });
    const isNewUser = !targetUser;
    const previousRole = isNewUser ? 'none' : targetUser.role;

    if (isNewUser) {
      // Pre-provision account as approved editor so when they sign in with Google they immediately have editor access
      targetUser = new User({
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: 'editor',
        status: 'approved',
        permissions: validPerms,
        isProfileComplete: true,
        roleChangedAt: new Date(),
        roleChangedBy: req.user._id,
      });
      await targetUser.save();
    } else {
      if (targetUser.role === 'admin') {
        return res.status(400).json({ message: 'Administrator accounts cannot be appointed as editors.' });
      }

      targetUser.role = 'editor';
      targetUser.permissions = validPerms;
      targetUser.status = 'approved';
      targetUser.roleChangedAt = new Date();
      targetUser.roleChangedBy = req.user._id;
      await targetUser.save();
    }

    await AuditEvent.create({
      actor: req.user._id,
      action: 'staff.editor_appointed',
      targetType: 'User',
      targetId: String(targetUser._id),
      metadata: {
        email: targetUser.email,
        previousRole,
        permissions: validPerms,
      },
      ipAddress: req.ip || '',
    });

    emitToUser(String(targetUser._id), 'auth:permissions_updated', {
      role: 'editor',
      permissions: validPerms,
    });
    syncUserSocketRooms(targetUser._id, targetUser);
    emitToAdmins('admin:student_updated', { studentId: String(targetUser._id) });
    emitToAdmins('admin:staff_updated', { editorId: String(targetUser._id) });

    emailService.notifyUserEditorAppointed({
      userEmail: targetUser.email,
      userName: targetUser.name,
      permissions: validPerms,
      appointedBy: req.user.email || req.user.name,
    }).catch((err) => console.error('[EmailService] Editor appointment notification error:', err.message));

    try {
      const editorNotif = new Notification({
        user: targetUser._id,
        type: 'editor_appointed',
        title: 'Editorial Board Appointment',
        message: `You have been appointed as a Depository Editor with permissions: ${validPerms.join(', ') || 'standard privileges'}.`,
      });
      await editorNotif.save();
      emitToUser(String(targetUser._id), 'notification:new', editorNotif);
    } catch (notifErr) {
      console.error('[Admin] Editor notification error:', notifErr.message);
    }

    return res.status(201).json({
      message: `Successfully appointed ${targetUser.name} (${targetUser.email}) as Editor.`,
      editor: toSanitizedUserDto(targetUser),
    });
  } catch (err) {
    console.error('Error appointing editor:', err);
    return res.status(500).json({ message: 'Failed to appoint editor.' });
  }
});

// PATCH /api/admin/editors/:id
// Updates permissions for an existing editor
router.patch('/editors/:id', requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const editorId = req.params.id;
    const { permissions } = req.body;

    const editor = await User.findOne({ _id: editorId, role: 'editor' });
    if (!editor) {
      return res.status(404).json({ message: 'Editor not found.' });
    }

    const requestedPerms = Array.isArray(permissions) ? permissions : [];
    const validPerms = requestedPerms.filter((p) => ALL_PERMISSIONS.includes(p));

    const oldPerms = [...(editor.permissions || [])];
    editor.permissions = validPerms;
    editor.roleChangedAt = new Date();
    editor.roleChangedBy = req.user._id;
    await editor.save();

    await AuditEvent.create({
      actor: req.user._id,
      action: 'staff.permissions_updated',
      targetType: 'User',
      targetId: String(editor._id),
      metadata: {
        email: editor.email,
        oldPermissions: oldPerms,
        newPermissions: validPerms,
      },
      ipAddress: req.ip || '',
    });

    emitToUser(String(editor._id), 'auth:permissions_updated', {
      role: 'editor',
      permissions: validPerms,
    });
    syncUserSocketRooms(editor._id, editor);
    emitToAdmins('admin:staff_updated', { editorId: String(editor._id) });

    emailService.notifyUserEditorPermissionsUpdated({
      userEmail: editor.email,
      userName: editor.name,
      permissions: validPerms,
      updatedBy: req.user.email || req.user.name,
    }).catch((err) => console.error('[EmailService] Editor permissions update notification error:', err.message));

    try {
      const editorNotif = new Notification({
        user: editor._id,
        type: 'permissions_updated',
        title: 'Editorial Permissions Updated',
        message: `Your active editorial permissions: ${validPerms.join(', ') || 'none'}.`,
      });
      await editorNotif.save();
      emitToUser(String(editor._id), 'notification:new', editorNotif);
    } catch (notifErr) {
      console.error('[Admin] Editor update notification error:', notifErr.message);
    }

    return res.json({
      message: `Permissions updated for editor ${editor.name}.`,
      editor: toSanitizedUserDto(editor),
    });
  } catch (err) {
    console.error('Error updating editor permissions:', err);
    return res.status(500).json({ message: 'Failed to update editor permissions.' });
  }
});

// DELETE /api/admin/editors/:id
// Revokes editor access, returning user to approved student status
router.delete('/editors/:id', requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const editorId = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(editorId);
    const editor = await User.findOne({
      $or: [
        { _id: isObjectId ? editorId : null },
        { email: String(editorId).trim().toLowerCase() },
      ],
      role: 'editor',
    });
    if (!editor) {
      return res.status(404).json({ message: 'Editor not found or account is not an editor.' });
    }

    editor.role = 'student';
    editor.permissions = [];
    editor.roleChangedAt = new Date();
    editor.roleChangedBy = req.user._id;
    await editor.save();

    // Revoke privileged socket rooms immediately
    revokeUserSocketPrivileges(editor._id);

    await AuditEvent.create({
      actor: req.user._id,
      action: 'staff.editor_revoked',
      targetType: 'User',
      targetId: String(editor._id),
      metadata: {
        email: editor.email,
        demotedTo: 'student',
      },
      ipAddress: req.ip || '',
    });

    emitToUser(String(editor._id), 'auth:permissions_updated', {
      role: 'student',
      permissions: [],
    });
    emitToAdmins('admin:student_updated', { studentId: String(editor._id) });
    emitToAdmins('admin:staff_updated', { editorId: String(editor._id) });

    return res.json({
      message: `Editor privileges revoked for ${editor.name}. Account returned to approved student status.`,
      user: toSanitizedUserDto(editor),
    });
  } catch (err) {
    console.error('Error revoking editor:', err);
    return res.status(500).json({ message: 'Failed to revoke editor privileges.' });
  }
});

// ==========================================
// 3. Local Depository Publications Moderation
// ==========================================

// GET /api/admin/publications
// Returns local repository publications with pagination, status filters, and search
router.get('/publications', requirePermission(PERMISSIONS.PUBLICATIONS_MODERATE), async (req, res) => {
  try {
    const { status = 'all', q = '', page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (q && q.trim()) {
      const searchRegex = new RegExp(escapeRegex(q.trim()), 'i');
      filter.$or = [
        { title: searchRegex },
        { author: searchRegex },
        { university: searchRegex },
        { catalogId: searchRegex },
      ];
    }

    const cleanPage = Math.max(1, parseInt(page, 10) || 1);
    const cleanLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (cleanPage - 1) * cleanLimit;

    const [publications, total, pendingCount] = await Promise.all([
      Thesis.find(filter)
        .populate('submittedBy', 'name email university')
        .populate('approvedBy', 'name email')
        .populate('rejectedBy', 'name email')
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(cleanLimit),
      Thesis.countDocuments(filter),
      Thesis.countDocuments({ status: 'pending' }),
    ]);

    return res.json({
      publications,
      total,
      page: cleanPage,
      totalPages: Math.ceil(total / cleanLimit) || 1,
      pendingCount,
    });
  } catch (err) {
    console.error('Error fetching admin publications:', err);
    return res.status(500).json({ message: 'Failed to retrieve publications.' });
  }
});

// GET /api/admin/pending-theses
// Backward-compatible alias for user-submitted publications pending moderation
router.get('/pending-theses', requirePermission(PERMISSIONS.PUBLICATIONS_MODERATE), async (req, res) => {
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

// PUT /api/admin/publications/:id/approve
// Approves a pending thesis
router.put('/publications/:id/approve', requirePermission(PERMISSIONS.PUBLICATIONS_MODERATE), adminActionLimiter, async (req, res) => {
  try {
    const now = new Date();
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id,
      {
        status: 'approved',
        approvedAt: now,
        approvedBy: req.user._id,
        updatedAt: now,
      },
      { new: true }
    ).populate('submittedBy', 'name email');

    if (!thesis) {
      return res.status(404).json({ message: 'Publication not found.' });
    }

    emitThesisUpdated(thesis);

    await AuditEvent.create({
      actor: req.user._id,
      action: 'publication.approved',
      targetType: 'Thesis',
      targetId: String(thesis._id),
      metadata: { title: thesis.title },
      ipAddress: req.ip || '',
    });

    if (thesis.submittedBy) {
      const notif = new Notification({
        user: thesis.submittedBy._id,
        type: 'thesis_approved',
        title: 'Publication Approved',
        message: `Your submitted publication "${thesis.title}" has been approved for the academic depository.`,
      });
      await notif.save();
      emitToUser(String(thesis.submittedBy._id), 'notification:new', notif);
    }

    return res.json({ message: 'Publication approved for public discovery.', thesis });
  } catch (err) {
    console.error('Error approving publication:', err);
    return res.status(500).json({ message: 'Failed to approve publication.' });
  }
});

// PUT /api/admin/publications/:id/reject
// Rejects a submitted thesis with mandatory reason
router.put('/publications/:id/reject', requirePermission(PERMISSIONS.PUBLICATIONS_MODERATE), adminActionLimiter, async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ message: 'A mandatory rejection reason is required.' });
    }

    const now = new Date();
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id,
      {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        rejectedBy: req.user._id,
        rejectedAt: now,
        updatedAt: now,
      },
      { new: true }
    ).populate('submittedBy', 'name email');

    if (!thesis) {
      return res.status(404).json({ message: 'Publication not found.' });
    }

    emitThesisUpdated(thesis);

    await AuditEvent.create({
      actor: req.user._id,
      action: 'publication.rejected',
      targetType: 'Thesis',
      targetId: String(thesis._id),
      metadata: { title: thesis.title, reason: rejectionReason.trim() },
      ipAddress: req.ip || '',
    });

    if (thesis.submittedBy) {
      const notif = new Notification({
        user: thesis.submittedBy._id,
        type: 'thesis_rejected',
        title: 'Publication Moderation Notice',
        message: `Your submitted publication "${thesis.title}" was not approved: "${rejectionReason.trim()}".`,
      });
      await notif.save();
      emitToUser(String(thesis.submittedBy._id), 'notification:new', notif);
    }

    return res.json({ message: 'Publication rejected.', thesis });
  } catch (err) {
    console.error('Error rejecting publication:', err);
    return res.status(500).json({ message: 'Failed to reject publication.' });
  }
});

// DELETE /api/admin/publications/:id
// Admin only: Permanently removes a publication from the local repository
router.delete('/publications/:id', requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const thesis = await Thesis.findByIdAndDelete(req.params.id);
    if (!thesis) {
      return res.status(404).json({
        message: 'Publication not found in local depository. External federated records cannot be deleted.',
      });
    }

    emitToAdmins('admin:thesis_deleted', { thesisId: String(thesis._id) });

    // Remove the uploaded PDF with the record (does nothing for linked PDFs; never blocks the delete)
    if (thesis.pdfStorageRef) {
      await thesisFileStorage.destroyThesisPdfIfUnused(thesis.pdfStorageRef, Thesis);
    }

    await AuditEvent.create({
      actor: req.user._id,
      action: 'publication.deleted',
      targetType: 'Thesis',
      targetId: String(thesis._id),
      metadata: { title: thesis.title },
      ipAddress: req.ip || '',
    });

    return res.json({ message: `Publication "${thesis.title}" permanently removed.` });
  } catch (err) {
    console.error('[routes/admin.js] Failed to delete publication:', err);
    return res.status(500).json({ message: 'Failed to delete publication.' });
  }
});

// ==========================================
// 4. Reports Queue & Resolution
// ==========================================

// GET /api/admin/reports
router.get('/reports', requirePermission(PERMISSIONS.REPORTS_MODERATE), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status && status !== 'all' ? { status } : {};
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .populate('resolvedBy', 'name email');
    return res.json(reports);
  } catch (err) {
    console.error('[routes/admin.js] Failed to retrieve reports queue:', err);
    return res.status(500).json({ message: 'Failed to retrieve reports queue.' });
  }
});

// PUT /api/admin/reports/:id
router.put('/reports/:id', requirePermission(PERMISSIONS.REPORTS_MODERATE), adminActionLimiter, async (req, res) => {
  try {
    const { status, adminNotes } = req.body || {};
    if (status !== undefined && !['pending', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Status must be pending, resolved or dismissed.' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });

    if (status) report.status = status;
    if (adminNotes !== undefined) report.adminNotes = String(adminNotes || '').trim().slice(0, 1000);

    if (report.status === 'pending') {
      // Reopened: it is no longer closed by anyone
      report.resolvedBy = null;
      report.resolvedAt = null;
    } else {
      report.resolvedBy = req.user._id;
      report.resolvedAt = new Date();
    }

    await report.save();
    return res.json({ message: 'Report updated.', report });
  } catch (err) {
    console.error('[Admin] Report update error:', err);
    return res.status(500).json({ message: 'Failed to update report.' });
  }
});

// ==========================================
// 5. bKash Payment Review Queue
// ==========================================

// GET /api/admin/payments
router.get('/payments', requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const q = escapeRegex(search.trim());
      filter.$or = [
        { trxId: new RegExp(q, 'i') },
        { normalizedTrxId: new RegExp(q, 'i') },
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
router.post('/payments/:id/approve', requirePermission(PERMISSIONS.PAYMENTS_REVIEW), paymentActionLimiter, adminActionLimiter, async (req, res) => {
  try {
    const adminNotes = (req.body?.adminNotes || req.body?.adminInstructions || req.body?.notes || '').trim();

    // 1. Merchant reconciliation proof
    const isStatementVerified =
      req.body.verifiedInMerchantStatement === true ||
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

    // 3. Idempotency Guard
    if (existingSubmission.status === 'approved') {
      const existingPeriod = await MembershipPeriod.findOne({
        paymentSubmission: existingSubmission._id,
      });

      const order = existingSubmission.order;
      const planCode = order?.planCode || order?.plan || 'premium_6m';
      const planDef = getPlan(planCode);
      const amountBdt = order?.pricePaisa ? order.pricePaisa / 100 : planDef.price || 500;

      const targetUserId = existingSubmission.user?._id || existingSubmission.user;
      const targetUser = await User.findById(targetUserId);
      if (targetUser && targetUser.email) {
        emailService.notifyUserPaymentApproved({
          userEmail: targetUser.email,
          userName: targetUser.name,
          planLabel: planDef.label,
          expiresAt: existingPeriod?.expiresAt || new Date(),
          trxId: existingSubmission.trxId,
          amount: amountBdt,
        }).catch((err) => console.error('[EmailService] Payment approval notification error:', err.message));
      }

      return res.status(200).json({
        message: 'Payment submission was already approved; returning existing membership record.',
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

    // 4. Resolve Plan & Order Snapshot
    const order = existingSubmission.order;
    const durationMonths = order?.durationMonths || 6;
    const planCode = order?.planCode || order?.plan || 'premium_6m';
    const planDef = getPlan(planCode);
    const amountBdt = order?.pricePaisa ? order.pricePaisa / 100 : planDef.price || 500;
    const userId = existingSubmission.user._id;
    const now = new Date();

    // 5. Concurrency & Execution
    let session = null;
    let submission = null;
    let period = null;
    let activePaid = null;
    let startsAt = now;
    let newExpiresAt = null;

    const executeApprovalWork = async (activeSession = null) => {
      const sessionOpt = activeSession ? { session: activeSession } : {};

      const sub = await PaymentSubmission.findOneAndUpdate(
        { _id: req.params.id, status: { $in: ['submitted', 'under_review'] } },
        {
          status: 'approved',
          adminInstructions: adminNotes || existingSubmission.adminInstructions || '',
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
        },
        { new: true, ...sessionOpt }
      )
        .populate('user', 'name email')
        .populate('order');

      if (!sub) {
        return { conflict: true };
      }

      // Renewal chaining calculation
      const foundActivePaid = await MembershipPeriod.findOne(
        {
          user: userId,
          status: 'active',
          expiresAt: { $gt: now },
          paymentSubmission: { $ne: sub._id },
        },
        null,
        sessionOpt
      ).sort({ expiresAt: -1 });

      let calculatedStartsAt = now;
      let calculatedExpiresAt = null;

      if (foundActivePaid) {
        calculatedStartsAt = foundActivePaid.expiresAt;
        calculatedExpiresAt = addDhakaCalendarMonths(foundActivePaid.expiresAt, durationMonths);
      } else {
        calculatedStartsAt = now;
        calculatedExpiresAt = addDhakaCalendarMonths(now, durationMonths);
      }

      // Convert active trial
      await TrialGrant.updateMany(
        { user: userId, status: 'active' },
        { status: 'converted' },
        sessionOpt
      );

      // Create MembershipPeriod
      let p = await MembershipPeriod.findOne({ paymentSubmission: sub._id }, null, sessionOpt);
      if (!p) {
        p = new MembershipPeriod({
          user: userId,
          order: sub.order?._id || null,
          paymentSubmission: sub._id,
          source: 'payment',
          plan: planDef.code,
          startsAt: calculatedStartsAt,
          expiresAt: calculatedExpiresAt,
          status: 'active',
        });
        await p.save(sessionOpt);
      }

      if (sub.order) {
        await MembershipOrder.findByIdAndUpdate(sub.order._id, { status: 'completed' }, sessionOpt);
      }

      await AuditEvent.create(
        [
          {
            actor: req.user._id,
            action: 'payment.approved',
            targetType: 'PaymentSubmission',
            targetId: String(sub._id),
            metadata: {
              userId: String(userId),
              trxId: sub.normalizedTrxId,
              planCode: planDef.code,
              pricePaisa: order?.pricePaisa || planDef.pricePaisa,
              durationMonths,
              startsAt: calculatedStartsAt,
              expiresAt: calculatedExpiresAt,
              renewal: Boolean(foundActivePaid),
              transactional: Boolean(activeSession),
            },
            ipAddress: req.ip || '',
          },
        ],
        sessionOpt
      );

      return {
        sub,
        p,
        activePaid: foundActivePaid,
        startsAt: calculatedStartsAt,
        newExpiresAt: calculatedExpiresAt,
      };
    };

    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const result = await executeApprovalWork(session);
        if (result.conflict) throw new Error('STATUS_TRANSITION_CONFLICT');
        submission = result.sub;
        period = result.p;
        activePaid = result.activePaid;
        startsAt = result.startsAt;
        newExpiresAt = result.newExpiresAt;
      });
    } catch (txErr) {
      const isReplicaSetError =
        txErr.message?.includes('replica set') ||
        txErr.message?.includes('Transaction numbers are only allowed') ||
        txErr.code === 20 ||
        txErr.codeName === 'IllegalOperation';

      if (isReplicaSetError) {
        const result = await executeApprovalWork(null);
        if (result.conflict) {
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
        submission = result.sub;
        period = result.p;
        activePaid = result.activePaid;
        startsAt = result.startsAt;
        newExpiresAt = result.newExpiresAt;
      } else if (txErr.message === 'STATUS_TRANSITION_CONFLICT') {
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
      } else {
        throw txErr;
      }
    } finally {
      if (session) await session.endSession();
    }

    // In-app Notification using accurate terms
    const notif = new Notification({
      user: userId,
      type: 'payment_approved',
      title: `bKash Payment Approved — ${planDef.label} Activated`,
      message: `Your bKash transaction ${submission.trxId} (৳${amountBdt}) has been verified. ${planDef.label} is active through ${formatDhakaDateTime(newExpiresAt)}.`,
    });
    await notif.save();

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
    emitToAdmins('admin:student_updated', { studentId: String(userId) });

    const targetUser = submission?.user?.email
      ? submission.user
      : (await User.findById(userId).select('name email')) || existingSubmission.user;

    if (targetUser && targetUser.email) {
      emailService.notifyUserPaymentApproved({
        userEmail: targetUser.email,
        userName: targetUser.name,
        planLabel: planDef.label,
        expiresAt: newExpiresAt,
        trxId: submission?.trxId || existingSubmission.trxId,
        amount: amountBdt,
      }).catch((err) => console.error('[EmailService] Payment approval notification error:', err.message));
    }

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
router.post('/payments/:id/reject', requirePermission(PERMISSIONS.PAYMENTS_REVIEW), paymentActionLimiter, adminActionLimiter, async (req, res) => {
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
    console.error('[routes/admin.js] Failed to reject payment:', err);
    return res.status(500).json({ message: 'Failed to reject payment.' });
  }
});

// POST /api/admin/payments/:id/request-correction
router.post('/payments/:id/request-correction', requirePermission(PERMISSIONS.PAYMENTS_REVIEW), paymentActionLimiter, adminActionLimiter, async (req, res) => {
  try {
    const { adminInstructions } = req.body;
    if (!adminInstructions || !adminInstructions.trim()) {
      return res.status(400).json({ message: 'Correction instructions are required.' });
    }

    const submission = await PaymentSubmission.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['submitted', 'under_review'] } },
      {
        status: 'under_review',
        adminInstructions: adminInstructions.trim(),
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { new: true }
    );

    if (!submission) return res.status(409).json({ message: 'Payment submission not found or cannot be modified from its current status.' });

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
    console.error('[routes/admin.js] Failed to request correction:', err);
    return res.status(500).json({ message: 'Failed to request correction.' });
  }
});

// POST /api/admin/membership/:userId/cancel and /revoke
// Admin only: Cancels an active membership with optional or mandatory reason
async function handleRevokeUserMembership(req, res) {
  try {
    const { cancellationReason, reason } = req.body || {};
    const revocationReason = (cancellationReason || reason || '').trim() || 'Revoked by depository administration';

    const userId = req.params.userId || req.params.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Valid user ID is required.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot modify primary administrator membership.' });
    }

    const periods = await MembershipPeriod.find({ user: userId, status: 'active' });
    for (const p of periods) {
      p.status = 'cancelled';
      p.cancelledAt = new Date();
      p.cancelledBy = req.user._id;
      p.cancellationReason = revocationReason;
      await p.save();
    }

    await TrialGrant.updateMany(
      { user: userId, status: 'active' },
      { status: 'expired' }
    );

    await AuditEvent.create({
      actor: req.user._id,
      action: 'membership.cancelled',
      targetType: 'User',
      targetId: String(userId),
      metadata: { cancellationReason: revocationReason, cancelledPeriodsCount: periods.length },
      ipAddress: req.ip || '',
    });

    const notif = new Notification({
      user: userId,
      type: 'membership_cancelled',
      title: 'Membership Status Notice',
      message: `Your membership has been terminated by depository administration: "${revocationReason}". Your existing research library and data remain preserved.`,
    });
    await notif.save();

    emitToUser(String(userId), 'notification:new', notif);
    emitToUser(String(userId), 'membership:updated', { plan: 'free', expiresAt: null, source: 'default' });
    emitToAdmins('admin:student_updated', { studentId: String(userId) });

    return res.json({
      message: `Membership successfully revoked for ${user.name}.`,
      cancelledPeriods: periods.length,
    });
  } catch (err) {
    console.error('Cancel membership error:', err);
    return res.status(500).json({ message: 'Failed to cancel membership.' });
  }
}

router.post('/membership/:userId/cancel', requireAdmin, adminActionLimiter, handleRevokeUserMembership);
router.post('/membership/:userId/revoke', requireAdmin, adminActionLimiter, handleRevokeUserMembership);
router.post('/students/:id/revoke-membership', requireAdmin, adminActionLimiter, handleRevokeUserMembership);

// ==========================================
// 6. Manual Premium Grants with Exact Timestamps (Admin Only)
// ==========================================

// POST /api/admin/memberships/grants
// Provisions manual Premium or Pro Max access with timezone awareness and idempotency
router.post('/memberships/grants', requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const {
      userId,
      planCode,
      startsAt,
      expiresAt,
      grantReason,
      overlapMode = 'start_now',
      grantRequestId,
      grantType = 'standard',
      customLabel = '',
    } = req.body;

    // 1. Target validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Valid student user ID is required.' });
    }

    if (String(req.user._id) === String(userId)) {
      return res.status(400).json({ message: 'Self-grant of membership is prohibited.' });
    }

    const student = await User.findOne({ _id: userId, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Target user is not an eligible student account.' });
    }

    // 2. Plan code validation
    if (!['premium_6m', 'pro_max_12m'].includes(planCode)) {
      return res.status(400).json({ message: 'Plan must be either "premium_6m" or "pro_max_12m".' });
    }

    // 3. Reason validation
    if (!grantReason || typeof grantReason !== 'string' || grantReason.trim().length < 5) {
      return res.status(400).json({ message: 'A mandatory grant reason of at least 5 characters is required.' });
    }

    // 4. Idempotency check
    if (grantRequestId && typeof grantRequestId === 'string') {
      const existingGrant = await MembershipPeriod.findOne({ grantRequestId: grantRequestId.trim() });
      if (existingGrant) {
        if (String(existingGrant.user) !== String(student._id) || existingGrant.plan !== planCode) {
          return res.status(409).json({
            message: 'A grant request with this idempotency key already exists for different parameters.',
            code: 'IDEMPOTENCY_KEY_CONFLICT',
          });
        }
        emailService.notifyUserMembershipGranted({
          userEmail: student.email,
          userName: student.name,
          planLabel: existingGrant.customLabel || getPlan(planCode).label,
          expiresAt: existingGrant.expiresAt,
          grantReason: existingGrant.grantReason || grantReason.trim(),
          grantType: existingGrant.grantType || grantType,
        }).catch((err) => console.error('[EmailService] Membership grant replay error:', err.message));

        return res.status(200).json({
          message: 'Grant request was already processed; returning existing membership grant.',
          period: existingGrant,
          isReplay: true,
        });
      }
    }

    // 5. Date parsing and validation
    const parsedStartsAt = new Date(startsAt);
    const parsedExpiresAt = new Date(expiresAt);
    const now = new Date();

    if (isNaN(parsedStartsAt.getTime()) || isNaN(parsedExpiresAt.getTime())) {
      return res.status(400).json({ message: 'Invalid start or expiry timestamp provided.' });
    }

    if (parsedExpiresAt <= parsedStartsAt) {
      return res.status(400).json({ message: 'Expiry timestamp must be strictly after start timestamp.' });
    }

    // Maximum grant duration clamp: 730 days (2 years)
    const durationDays = (parsedExpiresAt.getTime() - parsedStartsAt.getTime()) / (1000 * 60 * 60 * 24);
    if (durationDays > 730) {
      return res.status(400).json({ message: 'Grant duration cannot exceed 730 days (2 years).' });
    }

    // 6. Overlap mode resolution
    let effectiveStartsAt = parsedStartsAt;
    let effectiveExpiresAt = parsedExpiresAt;

    const latestActivePaid = await MembershipPeriod.findOne({
      user: student._id,
      status: 'active',
      expiresAt: { $gt: now },
    }).sort({ expiresAt: -1 });

    if (overlapMode === 'start_now') {
      effectiveStartsAt = now;
      if (effectiveExpiresAt <= now) {
        return res.status(400).json({ message: 'Expiry must be in the future when starting immediately.' });
      }

      // Safety check: Never silently shorten an existing active paid period
      if (latestActivePaid && latestActivePaid.expiresAt > effectiveExpiresAt) {
        return res.status(400).json({
          message: `User already has active paid coverage until ${formatDhakaDateTime(latestActivePaid.expiresAt)}. An immediate grant with an earlier expiry would shorten their coverage. Please use 'extend_from_current_expiry' or select a later expiry.`,
          code: 'OVERLAP_SHORTENS_COVERAGE',
        });
      }
    } else if (overlapMode === 'extend_from_current_expiry') {
      if (latestActivePaid) {
        effectiveStartsAt = latestActivePaid.expiresAt;
        const requestedDurationMs = parsedExpiresAt.getTime() - parsedStartsAt.getTime();
        effectiveExpiresAt = new Date(effectiveStartsAt.getTime() + requestedDurationMs);
      } else {
        effectiveStartsAt = now;
      }
    } else if (overlapMode === 'schedule') {
      if (effectiveStartsAt < now) {
        return res.status(400).json({ message: 'Scheduled start timestamp must be in the future.' });
      }
      // Preserves active trial without converting prematurely
    } else {
      return res.status(400).json({ message: 'Invalid overlapMode. Must be "start_now", "schedule", or "extend_from_current_expiry".' });
    }

    const planDef = getPlan(planCode);
    const effectiveDurationDays = (effectiveExpiresAt.getTime() - effectiveStartsAt.getTime()) / (1000 * 60 * 60 * 24);

    // Auto-compute an honest, professional label if not explicitly provided
    let effectiveCustomLabel = customLabel ? customLabel.trim() : '';
    if (!effectiveCustomLabel) {
      const isTest = grantType === 'test' || /test|testing|eval/i.test(grantReason);
      const tierName = planCode === 'pro_max_12m' ? 'Pro Max Tier' : 'Premium Tier';

      if (isTest) {
        if (effectiveDurationDays <= 1.2) {
          effectiveCustomLabel = `Complimentary Test Access (24 Hours)`;
        } else if (effectiveDurationDays <= 7.5) {
          effectiveCustomLabel = `Complimentary Test Access (${Math.round(effectiveDurationDays)} Days)`;
        } else if (effectiveDurationDays <= 31) {
          effectiveCustomLabel = `Complimentary Test Access (${Math.round(effectiveDurationDays)} Days)`;
        } else {
          effectiveCustomLabel = `Complimentary Test Access (${tierName})`;
        }
      } else {
        if (effectiveDurationDays <= 1.2) {
          effectiveCustomLabel = `Academic Research Grant (24 Hours)`;
        } else if (effectiveDurationDays <= 7.5) {
          effectiveCustomLabel = `Academic Research Grant (${Math.round(effectiveDurationDays)} Days)`;
        } else if (effectiveDurationDays <= 31) {
          effectiveCustomLabel = `Academic Research Grant (${Math.round(effectiveDurationDays)} Days)`;
        } else if (effectiveDurationDays <= 190 && planCode === 'premium_6m') {
          effectiveCustomLabel = `Academic Research Grant (Premium 6-Month)`;
        } else if (effectiveDurationDays > 190 && planCode === 'pro_max_12m') {
          effectiveCustomLabel = `Academic Research Grant (Pro Max Annual)`;
        } else {
          effectiveCustomLabel = `Academic Research Grant (${tierName})`;
        }
      }
    }

    // 7. Create MembershipPeriod
    const period = new MembershipPeriod({
      user: student._id,
      source: 'manual_admin',
      plan: planCode,
      startsAt: effectiveStartsAt,
      expiresAt: effectiveExpiresAt,
      status: 'active',
      grantedBy: req.user._id,
      grantReason: grantReason.trim(),
      grantRequestId: grantRequestId ? grantRequestId.trim() : null,
      customLabel: effectiveCustomLabel,
      grantType: grantType || 'standard',
    });
    await period.save();

    // Convert active trial only after period has successfully persisted
    if (overlapMode === 'start_now') {
      await TrialGrant.updateMany(
        { user: student._id, status: 'active' },
        { status: 'converted' }
      );
    }

    // 8. Audit Event
    await AuditEvent.create({
      actor: req.user._id,
      action: 'membership.manual_grant',
      targetType: 'User',
      targetId: String(student._id),
      metadata: {
        planCode,
        startsAt: effectiveStartsAt,
        expiresAt: effectiveExpiresAt,
        reason: grantReason.trim(),
        overlapMode,
        grantRequestId: grantRequestId || null,
        customLabel: effectiveCustomLabel,
        grantType,
      },
      ipAddress: req.ip || '',
    });

    // 9. Notify user and emit real-time updates
    const notif = new Notification({
      user: student._id,
      type: 'membership_granted',
      title: `Research Access Granted — ${effectiveCustomLabel}`,
      message: `Depository administration has granted you ${effectiveCustomLabel} active through ${formatDhakaDateTime(effectiveExpiresAt)}. Note: "${grantReason.trim()}".`,
    });
    await notif.save();

    emitToUser(String(student._id), 'notification:new', notif);
    emitToUser(String(student._id), 'membership:updated', {
      plan: planDef.code,
      label: effectiveCustomLabel,
      expiresAt: effectiveExpiresAt,
      formattedExpiry: formatDhakaDateTime(effectiveExpiresAt),
      source: 'manual_admin',
    });
    emitToAdmins('admin:student_updated', { studentId: String(student._id) });

    emailService.notifyUserMembershipGranted({
      userEmail: student.email,
      userName: student.name,
      planLabel: effectiveCustomLabel,
      expiresAt: effectiveExpiresAt,
      grantReason: grantReason.trim(),
      grantType,
    }).catch((err) => console.error('[EmailService] Membership grant notification error:', err.message));

    return res.status(201).json({
      message: `${effectiveCustomLabel} granted to ${student.name} through ${formatDhakaDateTime(effectiveExpiresAt)}.`,
      period: {
        id: period._id,
        plan: period.plan,
        label: period.customLabel,
        startsAt: period.startsAt,
        expiresAt: period.expiresAt,
        formattedExpiry: formatDhakaDateTime(period.expiresAt),
        source: period.source,
        grantReason: period.grantReason,
      },
    });
  } catch (err) {
    console.error('Error creating manual grant:', err);
    return res.status(err.status || 500).json({ message: err.message || 'Failed to create manual membership grant.' });
  }
});

// POST /api/admin/memberships/grants/:id/revoke
// Admin only: Revokes a manual grant
router.post('/memberships/grants/:id/revoke', requireAdmin, adminActionLimiter, async (req, res) => {
  try {
    const { revocationReason } = req.body;
    if (!revocationReason || !revocationReason.trim()) {
      return res.status(400).json({ message: 'A mandatory revocation reason is required.' });
    }

    const period = await MembershipPeriod.findOne({
      _id: req.params.id,
      source: 'manual_admin',
      status: 'active',
    });

    if (!period) {
      return res.status(404).json({ message: 'Active manual grant not found.' });
    }

    period.status = 'cancelled';
    period.cancelledAt = new Date();
    period.cancelledBy = req.user._id;
    period.cancellationReason = revocationReason.trim();
    await period.save();

    await AuditEvent.create({
      actor: req.user._id,
      action: 'membership.manual_grant_revoked',
      targetType: 'MembershipPeriod',
      targetId: String(period._id),
      metadata: {
        userId: String(period.user),
        plan: period.plan,
        reason: revocationReason.trim(),
      },
      ipAddress: req.ip || '',
    });

    emitToUser(String(period.user), 'membership:updated', { plan: 'free', expiresAt: null });
    emitToAdmins('admin:student_updated', { studentId: String(period.user) });

    return res.json({ message: 'Manual grant successfully revoked.', period });
  } catch (err) {
    console.error('Error revoking manual grant:', err);
    return res.status(500).json({ message: 'Failed to revoke manual grant.' });
  }
});

// ==========================================
// 12. System Settings & Maintenance Controls
// ==========================================

const { getMaintenanceStatus, setMaintenanceStatus } = require('../services/systemSettingService');
const { getIO } = require('../socket');

router.get('/system/maintenance', requireAdmin, async (req, res) => {
  try {
    const status = await getMaintenanceStatus();
    return res.json(status);
  } catch (err) {
    console.error('[routes/admin.js] Failed to retrieve maintenance status:', err);
    return res.status(500).json({ message: 'Failed to retrieve maintenance status.' });
  }
});

router.put('/system/maintenance', requireAdmin, async (req, res) => {
  try {
    const { enabled, message } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Field "enabled" (boolean) is required.' });
    }

    const updated = await setMaintenanceStatus({
      enabled,
      message: message || undefined,
      updatedBy: req.user.email || String(req.user._id),
    });

    await AuditEvent.create({
      actor: req.user._id,
      action: enabled ? 'system:maintenance_enabled' : 'system:maintenance_disabled',
      targetType: 'SystemSetting',
      targetId: 'site_config',
      metadata: {
        enabled,
        message: updated.message,
      },
      ipAddress: req.ip || '',
    });

    const io = getIO();
    if (io) {
      io.emit('system:maintenance_changed', {
        enabled: updated.enabled,
        message: updated.message,
      });
    }

    return res.json({
      message: enabled
        ? 'Maintenance mode enabled successfully.'
        : 'Maintenance mode disabled successfully.',
      status: updated,
    });
  } catch (err) {
    console.error('Error updating maintenance status:', err);
    return res.status(500).json({ message: 'Failed to update maintenance status.' });
  }
});

module.exports = router;
