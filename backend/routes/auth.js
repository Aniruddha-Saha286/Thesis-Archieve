const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken, getJwtSecret } = require('../middleware/auth');
const { authLimiter, loginLimiter } = require('../middleware/rateLimit');
const { emitStudentProfileUpdated } = require('../socket');
const {
  verifyGoogleCredential,
  resolveAndSyncGoogleUser,
  toSanitizedUserDto,
} = require('../services/googleIdentityService');

const generateToken = (user) => {
  const secret = getJwtSecret();
  return jwt.sign(
    { id: user._id, role: user.role, status: user.status },
    secret,
    { expiresIn: '7d' }
  );
};

// POST /api/auth/google
// Unified Google authentication endpoint for Students, Editors, and Administrators.
// Cryptographically verifies Google ID token and server-authoritatively determines role.
router.post('/google', authLimiter, async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({
        message: 'Google authentication credential (ID token) is required.',
        code: 'MISSING_CREDENTIAL',
      });
    }

    // 1. Verify token cryptographically against official Google endpoints
    const payload = await verifyGoogleCredential(credential);

    // 2. Authoritatively resolve/provision the user record
    const user = await resolveAndSyncGoogleUser(payload, { ip: req.ip });

    // 3. Issue session token and return sanitized DTO
    const token = generateToken(user);
    return res.json({
      token,
      user: toSanitizedUserDto(user),
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        message: err.message,
        code: err.code || 'AUTH_ERROR',
        detail: err.detail || undefined,
      });
    }

    console.error('Google Auth Error:', err);
    return res.status(500).json({
      message: 'Failed to process Google authentication.',
      code: 'AUTH_SERVER_ERROR',
    });
  }
});

// POST /api/auth/complete-profile
// Student academic registration details (university, program, topic)
router.post('/complete-profile', authenticateToken, async (req, res) => {
  try {
    const {
      university,
      studentId,
      degreeProgram,
      researchDomain,
      thesisGoal,
      name,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (name && typeof name === 'string') user.name = name.trim();
    if (university && typeof university === 'string') user.university = university.trim();
    if (studentId && typeof studentId === 'string') user.studentId = studentId.trim();
    if (degreeProgram && typeof degreeProgram === 'string') user.degreeProgram = degreeProgram.trim();
    if (researchDomain && typeof researchDomain === 'string') user.researchDomain = researchDomain.trim();
    if (thesisGoal && typeof thesisGoal === 'string') user.thesisGoal = thesisGoal.trim();
    // SECURITY: idCardProof is strictly forbidden here; only the validated upload endpoint may set it.

    user.isProfileComplete = true;
    // Strict Admin Verification Policy:
    // Students can NEVER auto-verify. Unless an admin explicitly approved with verifiedAt and verifiedBy,
    // their status MUST be 'pending' awaiting editorial review!
    if (user.role === 'student' && (!user.verifiedAt || !user.verifiedBy)) {
      if (user.status !== 'banned') {
        user.status = 'pending';
      }
    }
    await user.save();
    emitStudentProfileUpdated(user);

    return res.json({
      message: 'Student profile updated successfully.',
      user: toSanitizedUserDto(user),
    });
  } catch (err) {
    console.error('Complete profile error:', err);
    return res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// POST /api/auth/login
// Temporary break-glass administrative password login.
// Gated strictly behind ENABLE_LEGACY_ADMIN_LOGIN=true. Disabled by default.
router.post('/login', loginLimiter, async (req, res) => {
  try {
    if (process.env.ENABLE_LEGACY_ADMIN_LOGIN !== 'true') {
      return res.status(404).json({
        message: 'Legacy password authentication is disabled. Please use the unified Google Sign-In gateway.',
        code: 'LEGACY_AUTH_DISABLED',
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Administrative email and password are required.' });
    }

    const cleanInput = String(email).trim().toLowerCase();
    const rawPassword = typeof password === 'string' ? password : String(password);

    // Look up administrator account strictly by exact normalized email
    const user = await User.findOne({
      email: cleanInput,
      role: 'admin',
    });

    if (!user || user.role !== 'admin' || !user.password) {
      // Constant-time comparison to mitigate timing attacks
      await bcrypt.compare(rawPassword, '$2a$12$e8r0.m0X5qR.G5Yy6Z3h.eZ9k2vQp6wRt8s7u4v1y0z1x2w3v4u5t');
      return res.status(401).json({ message: 'Invalid administrative email or password.' });
    }

    const isMatch = await bcrypt.compare(rawPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid administrative email or password.' });
    }

    const token = generateToken(user);
    return res.json({
      token,
      user: toSanitizedUserDto(user),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error during administrative authentication.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  return res.json({
    user: toSanitizedUserDto(req.user),
  });
});

module.exports = router;
