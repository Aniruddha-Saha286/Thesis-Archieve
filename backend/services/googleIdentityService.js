const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const AuditEvent = require('../models/AuditEvent');
const { getCapabilities } = require('../middleware/rbac');
const { emitNewStudentRegistered } = require('../socket');

/**
 * Standard email validation regex.
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Retrieves and strictly validates the configured PRIMARY_ADMIN_GOOGLE_EMAIL.
 * FAILS CLOSED: Returns null if missing, empty, contains '—', or is invalid syntax.
 */
function getValidatedPrimaryAdminEmail() {
  const envEmail = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
  if (!envEmail || typeof envEmail !== 'string') {
    return null;
  }
  const clean = envEmail.trim().toLowerCase();
  if (!clean || clean === '—' || clean.includes('—') || !isValidEmail(clean)) {
    return null;
  }
  return clean;
}

/**
 * Lazy-initializes Google OAuth2Client.
 */
function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || clientId === '—' || clientId.includes('—')) {
    throw new Error('Google OAuth client ID is not configured on the server.');
  }
  return new OAuth2Client(clientId);
}

/**
 * Sanitizes a User document into an authoritative, safe DTO.
 * Guarantees that raw storage references, password hashes, and provider tokens are NEVER exposed.
 */
function toSanitizedUserDto(user) {
  if (!user) return null;
  return {
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    capabilities: getCapabilities(user),
    isProfileComplete: Boolean(user.isProfileComplete),
    university: user.university || '',
    studentId: user.studentId || '',
    degreeProgram: user.degreeProgram || '',
    researchDomain: user.researchDomain || '',
    thesisGoal: user.thesisGoal || '',
    avatar: user.avatar || null,
    hasVerificationDocument: Boolean(user.idCardProof),
    verifiedAt: user.verifiedAt || null,
  };
}

/**
 * Verifies a Google ID credential against official Google endpoints.
 * Enforces signature, issuer, audience, expiry, verified email, and stable sub claim.
 */
async function verifyGoogleCredential(credential, options = {}) {
  if (!credential || typeof credential !== 'string') {
    const error = new Error('Google authentication credential (ID token) is required.');
    error.status = 400;
    error.code = 'INVALID_CREDENTIAL';
    throw error;
  }

  // Allow custom client injection for deterministic unit testing
  const client = options.googleClient || getGoogleClient();
  const clientId = options.clientId || process.env.GOOGLE_CLIENT_ID;

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
  } catch (verifyErr) {
    const error = new Error('Invalid, malformed, or expired Google authentication token.');
    error.status = 401;
    error.code = 'TOKEN_VERIFICATION_FAILED';
    error.detail = verifyErr.message;
    throw error;
  }

  const payload = ticket.getPayload();
  if (!payload) {
    const error = new Error('Empty or invalid token payload received from Google.');
    error.status = 401;
    error.code = 'EMPTY_PAYLOAD';
    throw error;
  }

  // Strict issuer validation
  const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
  if (!validIssuers.includes(payload.iss)) {
    const error = new Error('Invalid token issuer.');
    error.status = 401;
    error.code = 'INVALID_ISSUER';
    throw error;
  }

  // Strict audience validation
  if (payload.aud !== clientId) {
    const error = new Error('Token audience does not match application client ID.');
    error.status = 401;
    error.code = 'AUDIENCE_MISMATCH';
    throw error;
  }

  // Strict expiry check
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec) {
    const error = new Error('Google authentication token has expired.');
    error.status = 401;
    error.code = 'TOKEN_EXPIRED';
    throw error;
  }

  // Strict email verification check
  if (!payload.email || payload.email_verified !== true) {
    const error = new Error('A verified Google email address is required to sign in.');
    error.status = 403;
    error.code = 'EMAIL_NOT_VERIFIED';
    throw error;
  }

  // Strict subject check
  if (!payload.sub || typeof payload.sub !== 'string' || !payload.sub.trim()) {
    const error = new Error('Google authentication token is missing a valid subject identifier.');
    error.status = 401;
    error.code = 'MISSING_SUB';
    throw error;
  }

  return payload;
}

/**
 * Resolves or provisions a User from verified Google identity payload.
 * Authoritative role determination:
 * 1. PRIMARY_ADMIN_GOOGLE_EMAIL exact match -> role: 'admin', status: 'approved'
 * 2. Existing editor -> preserves role: 'editor' and persisted permissions
 * 3. Existing student -> preserves status (banned/approved/pending)
 * 4. New account -> role: 'student', status: 'pending'
 * 5. Rejects mismatched Google sub if account already bound
 */
async function resolveAndSyncGoogleUser(payload, reqContext = {}) {
  const email = payload.email.trim().toLowerCase();
  const userName = (payload.name || payload.given_name || 'University Scholar').trim();
  const userAvatar = payload.picture || null;
  const userGoogleId = String(payload.sub).trim();

  const primaryAdminEmail = getValidatedPrimaryAdminEmail();
  const isPrimaryAdmin = Boolean(primaryAdminEmail && email === primaryAdminEmail);

  let user = await User.findOne({ email });

  if (user) {
    // Identity binding check: if account is already bound to a different Google sub, reject
    if (user.googleId && user.googleId !== userGoogleId) {
      if (reqContext.ip) {
        try {
          await AuditEvent.create({
            actor: user._id,
            action: 'AUTH_GOOGLE_SUB_MISMATCH',
            targetType: 'User',
            targetId: String(user._id),
            metadata: {
              email,
              storedSubPrefix: user.googleId.slice(0, 4) + '***',
              attemptedSubPrefix: userGoogleId.slice(0, 4) + '***',
            },
            ipAddress: reqContext.ip,
          });
        } catch (auditErr) {
          console.error('Audit logging failed for sub mismatch:', auditErr);
        }
      }
      const error = new Error('Security Alert: This account is already bound to a different Google identity. Sign-in rejected.');
      error.status = 403;
      error.code = 'ACCOUNT_IDENTITY_MISMATCH';
      throw error;
    }

    if (isPrimaryAdmin) {
      // Primary admin exact match receives full admin access
      user.role = 'admin';
      user.status = 'approved';
      user.isProfileComplete = true;
      user.googleId = userGoogleId;
      if (userAvatar && !user.avatar) user.avatar = userAvatar;
      if (!user.name || user.name === 'University Scholar') user.name = userName;
      await user.save();
    } else if (user.role === 'editor') {
      // Preserve editor role and permissions! Ordinary login must never reset to student.
      if (!user.googleId) user.googleId = userGoogleId;
      if (userAvatar && !user.avatar) user.avatar = userAvatar;
      if (!user.name || user.name === 'University Scholar') user.name = userName;
      await user.save();
    } else if (user.role === 'admin') {
      // User was previously marked admin, but current login email is NOT the configured PRIMARY_ADMIN_GOOGLE_EMAIL.
      // If primaryAdminEmail is missing or different, Google sign-in cannot grant admin privileges.
      const error = new Error('Access restricted: This Google account is not configured as the primary administrator.');
      error.status = 403;
      error.code = 'UNAUTHORIZED_ADMIN_IDENTITY';
      throw error;
    } else {
      // Existing student: preserve role and status (banned, pending, approved)
      user.role = 'student';
      if (!user.googleId) user.googleId = userGoogleId;
      if (userAvatar && !user.avatar) user.avatar = userAvatar;
      if (!user.name || user.name === 'University Scholar') user.name = userName;
      await user.save();
    }
  } else {
    // New account provisioning
    if (isPrimaryAdmin) {
      user = new User({
        name: userName,
        email,
        googleId: userGoogleId,
        avatar: userAvatar,
        role: 'admin',
        status: 'approved',
        isProfileComplete: true,
        university: '',
        degreeProgram: 'Depository Administration',
        researchDomain: 'Administration',
      });
      await user.save();
    } else {
      user = new User({
        name: userName,
        email,
        googleId: userGoogleId,
        avatar: userAvatar,
        role: 'student',
        status: 'pending',
        isProfileComplete: false,
        university: '',
        degreeProgram: 'B.Sc. Undergraduate Thesis',
        researchDomain: 'Computer Science & NLP',
      });
      await user.save();
      emitNewStudentRegistered(user);
    }
  }

  return user;
}

module.exports = {
  isValidEmail,
  getValidatedPrimaryAdminEmail,
  getGoogleClient,
  toSanitizedUserDto,
  verifyGoogleCredential,
  resolveAndSyncGoogleUser,
};
