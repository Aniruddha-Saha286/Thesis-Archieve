const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const AuditEvent = require('../models/AuditEvent');
const { uploadLimiter } = require('../middleware/rateLimit');
const { emitStudentProfileUpdated } = require('../socket');
const emailService = require('../services/emailService');

// Configure Cloudinary strictly from environment variables
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

// Inspect file magic bytes for deep content validation
function validateMagicBytes(buffer, claimedMime) {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  // PNG: 89 50 4E 47
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  // PDF: %PDF (25 50 44 46)
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  // WebP: RIFF (bytes 0-3: 52 49 46 46) ... WEBP (bytes 8-11: 57 45 42 50)
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Strict MIME whitelist: reject unsupported image subtypes even if starting with image/
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JPEG, PNG, WebP, and PDF documents are accepted.'));
    }
  },
});

// POST /api/upload/id-card
// Secure student ID document upload with magic byte verification and private storage
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

    // Deep content verification: check file magic bytes
    const isValidContent = validateMagicBytes(req.file.buffer, req.file.mimetype);
    if (!isValidContent) {
      return res.status(400).json({
        message: 'File content verification failed. The uploaded file does not match an accepted image or PDF format.',
      });
    }

    // Private Object Storage Handling - NO base64/data-URI database fallback
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
      // Store private object key / reference, NOT public permanent URL
      documentRef = result.public_id;
    } catch (cloudErr) {
      console.error('Private storage upload failed:', cloudErr.message);
      return res.status(503).json({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Private storage upload encountered an error. User record was not modified.',
      });
    }

    // Update student's record with the private object reference
    const updatedStudent = await User.findByIdAndUpdate(
      req.user._id,
      { idCardProof: documentRef },
      { new: true }
    );

    if (updatedStudent) {
      emitStudentProfileUpdated(updatedStudent);
      emailService.notifyAdminNewVerification({
        studentName: updatedStudent.name,
        studentEmail: updatedStudent.email,
        university: updatedStudent.university,
        degreeProgram: updatedStudent.degreeProgram,
        studentId: updatedStudent.studentId,
        documentRef,
      }).catch((err) => console.error('[EmailService] Verification request notification error:', err.message));
    }

    // Audit event for document upload
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

// DELETE /api/upload/id-card
// Data deletion policy: permanently purge uploaded ID documents and create audit record
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

    // Audit the deletion
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

router.validateMagicBytes = validateMagicBytes;
module.exports = router;
module.exports.validateMagicBytes = validateMagicBytes;
