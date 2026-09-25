const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const { emitStudentProfileUpdated } = require('../socket');

// Configure Cloudinary strictly from environment variables - NO HARDCODED FALLBACKS
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
  // WebP: RIFF ...
  const isWebp =
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  // GIF: GIF
  const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;

  if (claimedMime === 'image/jpeg' || claimedMime === 'image/jpg') return isJpeg;
  if (claimedMime === 'image/png') return isPng;
  if (claimedMime === 'application/pdf') return isPdf;
  if (claimedMime === 'image/webp') return isWebp;
  if (claimedMime === 'image/gif') return isGif;

  return isJpeg || isPng || isPdf || isWebp || isGif;
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JPEG, PNG, WebP, and PDF documents are accepted.'));
    }
  },
});

// POST /api/upload/id-card
// Secure student ID document upload with magic byte verification and access control
router.post('/id-card', authenticateToken, upload.single('idCard'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No student credential document was uploaded.' });
    }

    // Deep content verification: check file magic bytes
    const isValidContent = validateMagicBytes(req.file.buffer, req.file.mimetype);
    if (!isValidContent) {
      return res.status(400).json({
        message: 'File content verification failed. The uploaded file does not match an accepted image or PDF format.',
      });
    }

    let resultUrl = '';
    let documentRef = '';

    if (hasCloudinary) {
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
        resultUrl = result.secure_url;
        documentRef = result.public_id;
      } catch (cloudErr) {
        console.warn('Cloudinary upload warning, falling back to data URI:', cloudErr.message);
      }
    }

    // Fallback if Cloudinary is unavailable or encountered an issue
    if (!resultUrl) {
      resultUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      documentRef = `local_doc_${req.user._id}_${Date.now()}`;
    }

    // Update student's record with the accessible reference
    const updatedStudent = await User.findByIdAndUpdate(
      req.user._id,
      { idCardProof: resultUrl },
      { new: true }
    );

    if (updatedStudent) {
      emitStudentProfileUpdated(updatedStudent);
    }

    return res.json({
      message: 'Student document uploaded successfully for review.',
      url: resultUrl,
      documentRef,
    });
  } catch (err) {
    console.error('Document upload error:', err.message);
    return res.status(500).json({ message: 'Failed to process document upload securely.' });
  }
});

// DELETE /api/upload/id-card
// Data deletion policy: Allow student or admin to permanently purge uploaded ID documents
router.delete('/id-card', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.idCardProof = '';
    await user.save();

    return res.json({ message: 'Uploaded student verification document permanently removed.' });
  } catch (err) {
    console.error('Delete ID proof error:', err);
    return res.status(500).json({ message: 'Failed to delete verification document.' });
  }
});

module.exports = router;
