const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditEvent = require('../models/AuditEvent');
const { uploadLimiter, thesisPdfUploadLimiter } = require('../middleware/rateLimit');
const Thesis = require('../models/Thesis');
const { emitStudentProfileUpdated, emitToAdmins, emitToUser } = require('../socket');
const emailService = require('../services/emailService');
const thesisFileStorage = require('../services/thesisFileStorage');

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

function validateMagicBytes(buffer, claimedMime) {
  if (!buffer || buffer.length < 4) return false;

  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isWebp =
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

  if (claimedMime === 'image/jpeg' || claimedMime === 'image/jpg') return isJpeg;
  if (claimedMime === 'image/png') return isPng;
  if (claimedMime === 'application/pdf') return isPdf;
  if (claimedMime === 'image/webp') return isWebp;

  return false;
}

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JPEG, PNG, WebP, and PDF documents are accepted.'));
    }
  },
});

router.post('/id-card', authenticateToken, uploadLimiter, upload.single('idCard'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No student credential document was uploaded.' });
    }

    if (!ALLOWED_MIMES.has(req.file.mimetype)) {
      return res.status(400).json({
        message: 'Unsupported document format. Only JPEG, PNG, WebP, and PDF files are accepted.',
      });
    }

    const isValidContent = validateMagicBytes(req.file.buffer, req.file.mimetype);
    if (!isValidContent) {
      return res.status(400).json({
        message: 'File content verification failed. The uploaded file does not match an accepted image or PDF format.',
      });
    }

    if (!hasCloudinary) {
      return res.status(503).json({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Identity document secure storage service is temporarily unavailable. User record was not modified.',
      });
    }

    let documentRef = '';
    try {
      const uploadPromise = new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'thesis_vault/student_ids',
            resource_type: req.file.mimetype === 'application/pdf' ? 'raw' : 'image',
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });

      const result = await uploadPromise;
      documentRef = result.public_id;
    } catch (cloudErr) {
      console.error('Private storage upload failed:', cloudErr.message);
      return res.status(503).json({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Private storage upload encountered an error. User record was not modified.',
      });
    }

    const updatedStudent = await User.findByIdAndUpdate(
      req.user._id,
      { idCardProof: documentRef },
      { new: true }
    );

    if (updatedStudent) {
      emitStudentProfileUpdated(updatedStudent);

      try {
        const adminUser = await User.findOne({ role: 'admin' });
        const notifPayload = {
          type: 'verification_request',
          title: 'Student Verification Requested',
          message: `${updatedStudent.name} (${updatedStudent.email}) submitted credential documents for identity review.`,
        };
        if (adminUser) {
          const adminNotif = new Notification({
            user: adminUser._id,
            ...notifPayload,
          });
          await adminNotif.save();
          emitToUser(String(adminUser._id), 'notification:new', adminNotif);
        }
        emitToAdmins('notification:new', notifPayload);
      } catch (notifErr) {
        console.error('[Upload] In-app notification error:', notifErr.message);
      }

      emailService.notifyAdminNewVerification({
        studentName: updatedStudent.name,
        studentEmail: updatedStudent.email,
        university: updatedStudent.university,
        degreeProgram: updatedStudent.degreeProgram,
        studentId: updatedStudent.studentId,
        documentRef,
      }).catch((err) => console.error('[EmailService] Verification request notification error:', err.message));

      emailService.notifyUserVerificationRequested({
        userEmail: updatedStudent.email,
        userName: updatedStudent.name,
        university: updatedStudent.university,
        degreeProgram: updatedStudent.degreeProgram,
        studentId: updatedStudent.studentId,
      }).catch((err) => console.error('[EmailService] User verification receipt error:', err.message));
    }

    await AuditEvent.create({
      actor: req.user._id,
      action: 'DOCUMENT_UPLOADED',
      targetType: 'User',
      targetId: String(req.user._id),
      metadata: { documentRef, mimeType: req.file.mimetype, sizeBytes: req.file.size },
      ipAddress: req.ip || '',
    });

    return res.json({
      message: 'Student credential document uploaded securely for administrative verification.',
      hasVerificationDocument: true,
    });
  } catch (err) {
    console.error('Document upload error:', err.message);
    return res.status(500).json({ message: 'Failed to process document upload securely.' });
  }
});

router.delete('/id-card', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const oldRef = user.idCardProof;
    if (oldRef && hasCloudinary && !oldRef.startsWith('data:') && !oldRef.startsWith('http')) {
      try {
        const isPdf = oldRef.endsWith('.pdf');
        await cloudinary.uploader.destroy(oldRef, { resource_type: isPdf ? 'raw' : 'image' });
      } catch (cloudErr) {
        console.warn('Failed to delete Cloudinary asset:', cloudErr.message);
      }
    }

    user.idCardProof = '';
    await user.save();

    await AuditEvent.create({
      actor: req.user._id,
      action: 'DOCUMENT_DELETED',
      targetType: 'User',
      targetId: String(req.user._id),
      metadata: { previousRef: oldRef },
      ipAddress: req.ip || '',
    });

    return res.json({ message: 'Uploaded student verification document permanently removed.' });
  } catch (err) {
    console.error('Delete ID proof error:', err);
    return res.status(500).json({ message: 'Failed to delete verification document.' });
  }
});

const THESIS_PDF_MAX_MB = thesisFileStorage.getMaxUploadMb();
const thesisPdfUpload = multer({
  storage,
  limits: { fileSize: THESIS_PDF_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      const err = new Error('Only PDF files can be uploaded.');
      err.code = 'NOT_PDF';
      cb(err);
    }
  },
});

function receiveThesisPdf(req, res, next) {
  thesisPdfUpload.single('thesisPdf')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ code: 'FILE_TOO_LARGE', message: `The PDF is larger than ${THESIS_PDF_MAX_MB} MB. Compress it or paste a link to the file instead.` });
    }
    if (err.code === 'NOT_PDF') {
      return res.status(400).json({ code: 'NOT_PDF', message: 'Only PDF files can be uploaded.' });
    }
    console.error('[routes/upload.js] Thesis PDF upload was rejected:', err.message);
    return res.status(400).json({ message: 'The file could not be received. Please try again.' });
  });
}

router.post('/thesis-pdf', authenticateToken, thesisPdfUploadLimiter, receiveThesisPdf, async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'editor';
    if (!isStaff && req.user.status !== 'approved') {
      return res.status(403).json({ message: 'Your account must be approved before you can deposit a thesis.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No PDF was attached.' });
    }
    if (!thesisFileStorage.looksLikePdf(req.file.buffer)) {
      return res.status(400).json({ code: 'NOT_PDF', message: 'This file is not a real PDF. Export your thesis as PDF and try again.' });
    }
    if (!thesisFileStorage.hasStorage()) {
      return res.status(503).json({
        code: 'STORAGE_UNAVAILABLE',
        message: 'File upload is not available right now. You can paste a link to your PDF instead.',
      });
    }

    let stored;
    try {
      stored = await thesisFileStorage.uploadThesisPdf(req.file.buffer, { ownerId: req.user._id });
    } catch (storageErr) {
      console.error('[routes/upload.js] Thesis PDF storage failed:', storageErr.message);
      return res.status(503).json({
        code: 'STORAGE_UNAVAILABLE',
        message: 'The file could not be stored right now. Try again, or paste a link to your PDF instead.',
      });
    }

    await AuditEvent.create({
      actor: req.user._id,
      action: 'THESIS_PDF_UPLOADED',
      targetType: 'User',
      targetId: String(req.user._id),
      metadata: { storageRef: stored.storageRef, sizeBytes: stored.sizeBytes },
      ipAddress: req.ip || '',
    }).catch((auditErr) => console.error('[routes/upload.js] Audit record for thesis PDF failed:', auditErr.message));

    return res.status(201).json({
      message: 'PDF uploaded.',
      pdfUrl: stored.pdfUrl,
      storageRef: stored.storageRef,
      sizeBytes: stored.sizeBytes,
      fileName: String(req.file.originalname || 'thesis.pdf').slice(0, 200),
    });
  } catch (err) {
    console.error('[routes/upload.js] Thesis PDF upload failed:', err);
    return res.status(500).json({ message: 'The PDF could not be uploaded.' });
  }
});

router.delete('/thesis-pdf', authenticateToken, async (req, res) => {
  try {
    const ref = req.body && typeof req.body.storageRef === 'string' ? req.body.storageRef.trim() : '';
    if (!thesisFileStorage.isOwnStorageRef(ref)) {
      return res.status(400).json({ message: 'That is not an uploaded thesis file.' });
    }
    if (!thesisFileStorage.isUploadedBy(ref, req.user._id)) {
      return res.status(403).json({ message: 'You can only remove a file you uploaded yourself.' });
    }
    const outcome = await thesisFileStorage.destroyThesisPdfIfUnused(ref, Thesis);
    if (outcome.stillUsed) {
      return res.status(409).json({ message: 'This file belongs to a thesis that was already submitted.' });
    }
    return res.json({ removed: Boolean(outcome.removed) });
  } catch (err) {
    console.error('[routes/upload.js] Removing an uploaded thesis PDF failed:', err);
    return res.status(500).json({ message: 'The file could not be removed.' });
  }
});

router.validateMagicBytes = validateMagicBytes;
module.exports = router;
module.exports.validateMagicBytes = validateMagicBytes;
