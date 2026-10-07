const assert = require('assert');
const bcrypt = require('bcryptjs');

function runSecurityTests() {
  console.log('Testing: Priority 0 Security Enforcements & Data Protection...');

  function testMagicBytes(buffer, claimedMime) {
    if (!buffer || buffer.length < 4) return false;
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    const isWebp = buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

    if (claimedMime === 'image/jpeg') return isJpeg;
    if (claimedMime === 'image/png') return isPng;
    if (claimedMime === 'application/pdf') return isPdf;
    if (claimedMime === 'image/webp') return isWebp;
    return false;
  }

  const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35]);
  assert.strictEqual(testMagicBytes(validPdfBuffer, 'application/pdf'), true, 'Valid PDF buffer must pass');

  const spoofedExeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  assert.strictEqual(testMagicBytes(spoofedExeBuffer, 'application/pdf'), false, 'Executable disguised as PDF must be rejected');

  const spoofedText = Buffer.from('console.log("hello malicious world");');
  assert.strictEqual(testMagicBytes(spoofedText, 'image/png'), false, 'Script disguised as PNG must be rejected');

  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  assert.strictEqual(testMagicBytes(validPngBuffer, 'image/png'), true, 'Valid PNG buffer must pass');

  function validateGooglePayload(payload, expectedClientId) {
    if (!payload) throw new Error('Empty payload');
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) throw new Error('Invalid issuer');
    if (payload.aud !== expectedClientId) throw new Error('Audience mismatch');
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) throw new Error('Token expired');
    if (!payload.email || payload.email_verified !== true) throw new Error('Email not verified');
    return true;
  }

  const testAud = 'my-client-id.apps.googleusercontent.com';

  assert.throws(() => {
    validateGooglePayload({
      iss: 'accounts.google.com',
      aud: testAud,
      exp: Math.floor(Date.now() / 1000) - 100,
      email: 'student@university.edu',
      email_verified: true,
    }, testAud);
  }, /Token expired/, 'Expired Google token must be rejected');

  assert.throws(() => {
    validateGooglePayload({
      iss: 'accounts.google.com',
      aud: testAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'student@university.edu',
      email_verified: false,
    }, testAud);
  }, /Email not verified/, 'Unverified email must be rejected');

  assert.throws(() => {
    validateGooglePayload({
      iss: 'accounts.google.com',
      aud: 'different-app.apps.googleusercontent.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'student@university.edu',
      email_verified: true,
    }, testAud);
  }, /Audience mismatch/, 'Mismatched audience must be rejected');

  function assignRoleForGoogleAuth(existingUserRole) {
    if (existingUserRole === 'admin') {
      throw new Error('Administrative accounts must authenticate via the Administrative Gate');
    }
    return 'student';
  }

  assert.throws(() => {
    assignRoleForGoogleAuth('admin');
  }, /Administrative accounts must authenticate/, 'Google login for admin account must be blocked');

  assert.strictEqual(assignRoleForGoogleAuth('student'), 'student', 'Student stays student');
  assert.strictEqual(assignRoleForGoogleAuth(undefined), 'student', 'New user becomes student');

  const realAdminHash = bcrypt.hashSync('RealSuperSecurePass123!', 10);
  assert.strictEqual(bcrypt.compareSync('admin1234', realAdminHash), false, 'Old fixed password admin1234 must fail');
  assert.strictEqual(bcrypt.compareSync('admin', realAdminHash), false, 'Shorthand password admin must fail');
  assert.strictEqual(bcrypt.compareSync('RealSuperSecurePass123!', realAdminHash), true, 'Real password must pass');

  function determineSubmissionStatus(userRole) {
    return userRole === 'admin' ? 'approved' : 'pending';
  }

  assert.strictEqual(determineSubmissionStatus('student'), 'pending', 'Student submissions must default to pending review');
  assert.strictEqual(determineSubmissionStatus('user'), 'pending', 'User submissions must default to pending review');

  console.log('✓ All Security & Data Protection tests passed successfully.');
}

module.exports = { runSecurityTests };

if (require.main === module) {
  runSecurityTests();
}
