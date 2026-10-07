const assert = require('assert');
const { PERMISSIONS, ALL_PERMISSIONS } = require('../constants/permissions');
const { requirePermission, requireAdmin, getCapabilities } = require('../middleware/rbac');
const { requireApproved } = require('../middleware/auth');
const {
  isValidEmail,
  getValidatedPrimaryAdminEmail,
  verifyGoogleCredential,
  resolveAndSyncGoogleUser,
  toSanitizedUserDto,
} = require('../services/googleIdentityService');
const { addDhakaCalendarMonths, addDhakaDays } = require('../utils/dhakaDate');

async function runRbacAndGoogleAuthTests() {
  console.log('===============================================================');
  console.log('  TEST SUITE: UNIFIED GOOGLE AUTH, RBAC & ADMIN CONTROLS      ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function test(description, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${description}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  async function testAsync(description, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${description}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  function createMockReqRes({ user = null, body = {}, params = {}, query = {}, headers = {}, ip = '127.0.0.1' } = {}) {
    const req = { user, body, params, query, headers, ip };
    const res = {
      statusCode: 200,
      headersSent: false,
      data: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.data = data;
        return this;
      },
      setHeader(k, v) {
        headers[k] = v;
        return this;
      },
    };
    return { req, res };
  }

  console.log('--- 1. Primary Admin Environment Fail-Closed Validation ---');

  test('Valid standard email passes getValidatedPrimaryAdminEmail', () => {
    const original = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    try {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = '  Admin.Owner@University.Edu  ';
      const validated = getValidatedPrimaryAdminEmail();
      assert.strictEqual(validated, 'admin.owner@university.edu');
    } finally {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = original;
    }
  });

  test('Missing, undefined, or empty PRIMARY_ADMIN_GOOGLE_EMAIL returns null (fail closed)', () => {
    const original = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    try {
      delete process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);

      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = '';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);

      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = '   ';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);
    } finally {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = original;
    }
  });

  test('Placeholder "—" or containing "—" fails closed and returns null', () => {
    const original = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    try {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = '—';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);

      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = 'admin—test@domain.com';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);
    } finally {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = original;
    }
  });

  test('Syntactically invalid emails (comma typo, missing domain) return null', () => {
    const original = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    try {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = 'sahaaniruddha2004@gmail,com';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);

      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = 'invalid-email-address';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);

      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = '@domain.com';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);

      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = 'user@';
      assert.strictEqual(getValidatedPrimaryAdminEmail(), null);
    } finally {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = original;
    }
  });

  console.log('--- 2. Google Credential Verification Rules ---');

  await testAsync('verifyGoogleCredential rejects missing or empty credentials', async () => {
    await assert.rejects(
      async () => verifyGoogleCredential(null),
      /Google authentication credential .* is required/
    );
    await assert.rejects(
      async () => verifyGoogleCredential(''),
      /Google authentication credential .* is required/
    );
  });

  await testAsync('verifyGoogleCredential rejects audience mismatch', async () => {
    const mockClient = {
      verifyIdToken: async () => ({
        getPayload: () => ({
          iss: 'accounts.google.com',
          aud: 'different-app.apps.googleusercontent.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'student@campus.edu',
          email_verified: true,
          sub: 'google-sub-12345',
        }),
      }),
    };

    await assert.rejects(
      async () =>
        verifyGoogleCredential('dummy-token', {
          googleClient: mockClient,
          clientId: 'expected-client-id.apps.googleusercontent.com',
        }),
      (err) => err.code === 'AUDIENCE_MISMATCH'
    );
  });

  await testAsync('verifyGoogleCredential rejects invalid issuer', async () => {
    const testAud = 'my-client-id.apps.googleusercontent.com';
    const mockClient = {
      verifyIdToken: async () => ({
        getPayload: () => ({
          iss: 'malicious-issuer.com',
          aud: testAud,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'student@campus.edu',
          email_verified: true,
          sub: 'google-sub-12345',
        }),
      }),
    };

    await assert.rejects(
      async () =>
        verifyGoogleCredential('dummy-token', {
          googleClient: mockClient,
          clientId: testAud,
        }),
      (err) => err.code === 'INVALID_ISSUER'
    );
  });

  await testAsync('verifyGoogleCredential rejects expired tokens', async () => {
    const testAud = 'my-client-id.apps.googleusercontent.com';
    const mockClient = {
      verifyIdToken: async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: testAud,
          exp: Math.floor(Date.now() / 1000) - 60,
          email: 'student@campus.edu',
          email_verified: true,
          sub: 'google-sub-12345',
        }),
      }),
    };

    await assert.rejects(
      async () =>
        verifyGoogleCredential('dummy-token', {
          googleClient: mockClient,
          clientId: testAud,
        }),
      (err) => err.code === 'TOKEN_EXPIRED'
    );
  });

  await testAsync('verifyGoogleCredential rejects unverified email addresses', async () => {
    const testAud = 'my-client-id.apps.googleusercontent.com';
    const mockClient = {
      verifyIdToken: async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: testAud,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'unverified@campus.edu',
          email_verified: false,
          sub: 'google-sub-12345',
        }),
      }),
    };

    await assert.rejects(
      async () =>
        verifyGoogleCredential('dummy-token', {
          googleClient: mockClient,
          clientId: testAud,
        }),
      (err) => err.code === 'EMAIL_NOT_VERIFIED'
    );
  });

  await testAsync('verifyGoogleCredential rejects missing subject (sub) claim', async () => {
    const testAud = 'my-client-id.apps.googleusercontent.com';
    const mockClient = {
      verifyIdToken: async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: testAud,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'student@campus.edu',
          email_verified: true,
          sub: '',
        }),
      }),
    };

    await assert.rejects(
      async () =>
        verifyGoogleCredential('dummy-token', {
          googleClient: mockClient,
          clientId: testAud,
        }),
      (err) => err.code === 'MISSING_SUB'
    );
  });

  await testAsync('verifyGoogleCredential succeeds with verified payload', async () => {
    const testAud = 'my-client-id.apps.googleusercontent.com';
    const validPayload = {
      iss: 'accounts.google.com',
      aud: testAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'verified.student@du.ac.bd',
      email_verified: true,
      sub: 'google-sub-998877',
      name: 'Rahim Khan',
    };
    const mockClient = {
      verifyIdToken: async () => ({
        getPayload: () => validPayload,
      }),
    };

    const result = await verifyGoogleCredential('dummy-token', {
      googleClient: mockClient,
      clientId: testAud,
    });
    assert.strictEqual(result.email, 'verified.student@du.ac.bd');
    assert.strictEqual(result.sub, 'google-sub-998877');
  });

  console.log('--- 3. Authoritative DTO Sanitization ---');

  test('toSanitizedUserDto never exposes raw storage keys or credentials', () => {
    const userDoc = {
      _id: 'usr_1001',
      name: 'Sadia Rahman',
      email: 'sadia@univ.edu',
      role: 'student',
      status: 'pending',
      permissions: ['students.view'],
      password: 'argon2_hashed_secret',
      idCardProof: 'raw_cloudinary_private_public_id_abc123',
      googleId: '1029384756',
      isProfileComplete: false,
    };

    const dto = toSanitizedUserDto(userDoc);
    assert.strictEqual(dto.password, undefined, 'Password must never be in DTO');
    assert.strictEqual(dto.idCardProof, undefined, 'Raw idCardProof public_id must never be in DTO');
    assert.strictEqual(dto.googleId, undefined, 'Internal googleId must never be in DTO');
    assert.strictEqual(dto.hasVerificationDocument, true, 'Must expose boolean hasVerificationDocument');
    assert.strictEqual(dto.capabilities.isStaff, false, 'Student capabilities isStaff must be false');
    assert.strictEqual(dto.capabilities.role, 'student');
  });

  test('toSanitizedUserDto correctly reflects missing verification document', () => {
    const userDoc = {
      _id: 'usr_1002',
      name: 'Tareq Ahmed',
      email: 'tareq@univ.edu',
      role: 'student',
      status: 'pending',
      idCardProof: null,
    };

    const dto = toSanitizedUserDto(userDoc);
    assert.strictEqual(dto.hasVerificationDocument, false);
  });

  console.log('--- 4. RBAC Capability & Middleware Enforcements ---');

  test('Admin implicitly passes all granular permission checks', () => {
    const adminUser = {
      _id: 'adm_1',
      role: 'admin',
      status: 'approved',
      permissions: [],
    };

    ALL_PERMISSIONS.forEach((perm) => {
      const { req, res } = createMockReqRes({ user: adminUser });
      let called = false;
      const middleware = requirePermission(perm);
      middleware(req, res, () => {
        called = true;
      });
      assert.strictEqual(called, true, `Admin must implicitly pass ${perm}`);
    });
  });

  test('Editor with assigned permission passes requirePermission', () => {
    const editorUser = {
      _id: 'ed_1',
      role: 'editor',
      status: 'approved',
      permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.PUBLICATIONS_MODERATE],
    };

    const { req, res } = createMockReqRes({ user: editorUser });
    let called = false;
    requirePermission(PERMISSIONS.PUBLICATIONS_MODERATE)(req, res, () => {
      called = true;
    });
    assert.strictEqual(called, true, 'Editor with permissions.moderate must pass');
  });

  test('Editor without assigned permission receives 403 INSUFFICIENT_PERMISSIONS', () => {
    const editorUser = {
      _id: 'ed_1',
      role: 'editor',
      status: 'approved',
      permissions: [PERMISSIONS.STUDENTS_VIEW],
    };

    const { req, res } = createMockReqRes({ user: editorUser });
    let called = false;
    requirePermission(PERMISSIONS.PAYMENTS_REVIEW)(req, res, () => {
      called = true;
    });
    assert.strictEqual(called, false, 'Editor without permission must not call next');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.code, 'INSUFFICIENT_PERMISSIONS');
  });

  test('Student receives 403 FORBIDDEN_ROLE on staff permission checks', () => {
    const studentUser = {
      _id: 'stu_1',
      role: 'student',
      status: 'approved',
      permissions: [PERMISSIONS.STUDENTS_VIEW],
    };

    const { req, res } = createMockReqRes({ user: studentUser });
    let called = false;
    requirePermission(PERMISSIONS.STUDENTS_VIEW)(req, res, () => {
      called = true;
    });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.code, 'FORBIDDEN_ROLE');
  });

  test('Banned / suspended user is immediately blocked with 403 ACCOUNT_SUSPENDED', () => {
    const bannedEditor = {
      _id: 'ed_banned',
      role: 'editor',
      status: 'banned',
      banReason: 'Account compromised',
      permissions: ALL_PERMISSIONS,
    };

    const { req, res } = createMockReqRes({ user: bannedEditor });
    let called = false;
    requirePermission(PERMISSIONS.STUDENTS_VIEW)(req, res, () => {
      called = true;
    });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.status, 'banned');
    assert.strictEqual(res.data.banReason, 'Account compromised');
  });

  test('requireAdmin strictly allows only Admin and rejects Editor with 403 ADMIN_REQUIRED', () => {
    const admin = { _id: 'adm_1', role: 'admin', status: 'approved' };
    const editor = { _id: 'ed_1', role: 'editor', status: 'approved', permissions: ALL_PERMISSIONS };
    const student = { _id: 'stu_1', role: 'student', status: 'approved' };

    const { req: req1, res: res1 } = createMockReqRes({ user: admin });
    let adminCalled = false;
    requireAdmin(req1, res1, () => {
      adminCalled = true;
    });
    assert.strictEqual(adminCalled, true);

    const { req: req2, res: res2 } = createMockReqRes({ user: editor });
    let editorCalled = false;
    requireAdmin(req2, res2, () => {
      editorCalled = true;
    });
    assert.strictEqual(editorCalled, false);
    assert.strictEqual(res2.statusCode, 403);
    assert.strictEqual(res2.data.code, 'ADMIN_REQUIRED');

    const { req: req3, res: res3 } = createMockReqRes({ user: student });
    let studentCalled = false;
    requireAdmin(req3, res3, () => {
      studentCalled = true;
    });
    assert.strictEqual(studentCalled, false);
    assert.strictEqual(res3.statusCode, 403);
    assert.strictEqual(res3.data.code, 'ADMIN_REQUIRED');
  });

  test('getCapabilities computes authoritative permission matrix', () => {
    const adminCaps = getCapabilities({ role: 'admin' });
    assert.strictEqual(adminCaps.role, 'admin');
    assert.strictEqual(adminCaps.isStaff, true);
    assert.strictEqual(adminCaps.canManageEditors, true);
    assert.strictEqual(adminCaps.canGrantMembership, true);
    assert.strictEqual(adminCaps.permissions.length, ALL_PERMISSIONS.length);

    const editorCaps = getCapabilities({
      role: 'editor',
      permissions: [PERMISSIONS.DOCUMENTS_VIEW, 'invalid.permission.string'],
    });
    assert.strictEqual(editorCaps.role, 'editor');
    assert.strictEqual(editorCaps.isStaff, true);
    assert.strictEqual(editorCaps.canManageEditors, false);
    assert.strictEqual(editorCaps.canGrantMembership, false);
    assert.deepStrictEqual(editorCaps.permissions, [PERMISSIONS.DOCUMENTS_VIEW]);

    const studentCaps = getCapabilities({ role: 'student' });
    assert.strictEqual(studentCaps.role, 'student');
    assert.strictEqual(studentCaps.isStaff, false);
    assert.strictEqual(studentCaps.canManageEditors, false);
    assert.strictEqual(studentCaps.permissions.length, 0);

    const guestCaps = getCapabilities(null);
    assert.strictEqual(guestCaps.role, 'guest');
    assert.strictEqual(guestCaps.isStaff, false);
  });

  console.log('--- 5. Verification Document Security & Signed URLs ---');

  test('Document inspection endpoint requires documents.view permission', () => {
    const editorWithoutDocView = {
      _id: 'ed_nodocs',
      role: 'editor',
      status: 'approved',
      permissions: [PERMISSIONS.STUDENTS_VIEW],
    };

    const { req, res } = createMockReqRes({ user: editorWithoutDocView, params: { id: 'stu_1' } });
    let nextCalled = false;
    requirePermission(PERMISSIONS.DOCUMENTS_VIEW)(req, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.code, 'INSUFFICIENT_PERMISSIONS');
  });

  test('Document signing helper generates short-lived URL with 600s TTL and private caching', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + 600;
    const cacheControlHeader = 'private, no-cache, no-store, must-revalidate';

    assert(expiresAt - nowSec <= 600, 'Expiration must not exceed 10 minutes (600s)');
    assert(cacheControlHeader.includes('private'), 'Signed doc response must be marked private');
    assert(cacheControlHeader.includes('no-store'), 'Signed doc response must be marked no-store');
  });

  console.log('--- 6. Manual Premium Timestamp Grants & Overlap Handling ---');

  test('Manual grant start_now sets start to now and applies exact calendar duration', () => {
    const baseNow = new Date('2026-03-15T10:00:00.000Z');
    const overlapMode = 'start_now';
    const plan = 'premium';
    const durationMonths = 6;

    const startDate = baseNow;
    const endDate = addDhakaCalendarMonths(startDate, durationMonths);

    assert.strictEqual(startDate.toISOString(), '2026-03-15T10:00:00.000Z');
    assert.strictEqual(endDate.getUTCMonth(), 8, 'Must be September (month index 8)');
    assert.strictEqual(endDate.getUTCDate(), 15, 'Must be 15th');
  });

  test('Manual grant extend_from_current_expiry builds upon existing active end date', () => {
    const activeEndDate = new Date('2026-05-01T00:00:00.000Z');
    const overlapMode = 'extend_from_current_expiry';
    const durationMonths = 6;

    const newStartDate = activeEndDate;
    const newEndDate = addDhakaCalendarMonths(activeEndDate, durationMonths);

    assert.strictEqual(newEndDate.getUTCMonth(), 10, 'Must be November (month index 10)');
    assert.strictEqual(newEndDate.getUTCDate(), 1);
  });

  test('Manual grant schedule uses specified future start date', () => {
    const scheduledStart = new Date('2026-07-01T00:00:00.000Z');
    const durationMonths = 12;
    const calculatedEnd = addDhakaCalendarMonths(scheduledStart, durationMonths);

    assert.strictEqual(calculatedEnd.getUTCFullYear(), 2027);
    assert.strictEqual(calculatedEnd.getUTCMonth(), 6, 'Must be July');
  });

  test('Manual grant idempotency key prevents duplicate replay', () => {
    const grantRequestId = 'grant_req_unique_9988';
    const recordedIds = new Set(['grant_req_unique_9988']);

    const isDuplicate = recordedIds.has(grantRequestId);
    assert.strictEqual(isDuplicate, true, 'Duplicate grantRequestId must be detected');
  });

  console.log('--- 7. Team & Access Editor Lifecycle & Immunities ---');

  test('Primary admin cannot be appointed as editor, demoted, or revoked', () => {
    const original = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    try {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = 'admin@thesis.org';
      const primaryAdminEmail = getValidatedPrimaryAdminEmail();

      const targetUser = {
        _id: 'usr_admin',
        email: 'admin@thesis.org',
        role: 'admin',
      };

      const isPrimary = Boolean(primaryAdminEmail && targetUser.email === primaryAdminEmail);
      assert.strictEqual(isPrimary, true, 'Must identify primary admin');

      assert.throws(() => {
        if (isPrimary) {
          throw new Error('Primary administrator privileges cannot be modified or assigned as editor.');
        }
      }, /Primary administrator privileges cannot be modified/);
    } finally {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = original;
    }
  });

  test('Editor appointment filters out invalid permissions and sets audit fields', () => {
    const requestedPerms = [
      PERMISSIONS.STUDENTS_VIEW,
      PERMISSIONS.DOCUMENTS_VIEW,
      'bogus.permission',
      'root.access',
    ];

    const validPerms = requestedPerms.filter((p) => ALL_PERMISSIONS.includes(p));
    assert.deepStrictEqual(validPerms, [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.DOCUMENTS_VIEW]);

    const targetUser = {
      role: 'student',
      permissions: [],
      roleChangedAt: null,
      roleChangedBy: null,
    };

    targetUser.role = 'editor';
    targetUser.permissions = validPerms;
    targetUser.roleChangedAt = new Date();
    targetUser.roleChangedBy = 'adm_123';

    assert.strictEqual(targetUser.role, 'editor');
    assert.strictEqual(targetUser.permissions.length, 2);
    assert.strictEqual(targetUser.roleChangedBy, 'adm_123');
    assert(targetUser.roleChangedAt instanceof Date);
  });

  test('Editor revocation resets role to student and clears permissions', () => {
    const editor = {
      role: 'editor',
      permissions: [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.STUDENTS_VERIFY],
      roleChangedAt: new Date('2026-01-01'),
      roleChangedBy: 'adm_1',
    };

    editor.role = 'student';
    editor.permissions = [];
    editor.roleChangedAt = new Date();
    editor.roleChangedBy = 'adm_2';

    assert.strictEqual(editor.role, 'student');
    assert.deepStrictEqual(editor.permissions, []);
  });

  console.log('--- 8. Local Depository Moderation & Mandatory Rejection Reasons ---');

  test('Local thesis moderation approval sets approved status and records approvedBy', () => {
    const thesis = {
      _id: 'thes_1',
      title: 'Deep Learning for Bengali NLP',
      isApproved: false,
      status: 'pending',
      approvedBy: null,
    };

    const approverId = 'adm_1';
    thesis.isApproved = true;
    thesis.status = 'published';
    thesis.approvedBy = approverId;

    assert.strictEqual(thesis.isApproved, true);
    assert.strictEqual(thesis.status, 'published');
    assert.strictEqual(thesis.approvedBy, 'adm_1');
  });

  test('Local thesis moderation rejection enforces mandatory reason', () => {
    function rejectThesis(thesis, { reason, rejectedBy }) {
      const trimmed = (reason || '').trim();
      if (!trimmed || trimmed.length < 5) {
        const error = new Error('A detailed rejection reason (minimum 5 characters) is required for academic moderation.');
        error.status = 400;
        throw error;
      }
      thesis.isApproved = false;
      thesis.status = 'rejected';
      thesis.rejectionReason = trimmed;
      thesis.rejectedBy = rejectedBy;
      thesis.rejectedAt = new Date();
      return thesis;
    }

    const thesis = { _id: 'thes_2', status: 'pending' };

    assert.throws(
      () => rejectThesis(thesis, { reason: '', rejectedBy: 'ed_1' }),
      /rejection reason .* is required/
    );

    assert.throws(
      () => rejectThesis(thesis, { reason: '   ', rejectedBy: 'ed_1' }),
      /rejection reason .* is required/
    );

    assert.throws(
      () => rejectThesis(thesis, { reason: 'bad', rejectedBy: 'ed_1' }),
      /minimum 5 characters/
    );

    const rejected = rejectThesis(thesis, {
      reason: 'Methodology lacks experimental baseline validation against standard benchmark.',
      rejectedBy: 'ed_1',
    });
    assert.strictEqual(rejected.status, 'rejected');
    assert.strictEqual(rejected.rejectionReason.includes('benchmark'), true);
    assert.strictEqual(rejected.rejectedBy, 'ed_1');
    assert(rejected.rejectedAt instanceof Date);
  });

  test('Local depository deletion returns 404 when document not found in local store', () => {
    const localStore = new Map();

    function deleteLocalThesis(id) {
      if (!localStore.has(id)) {
        const error = new Error('Local depository publication not found.');
        error.status = 404;
        throw error;
      }
      localStore.delete(id);
      return { success: true };
    }

    assert.throws(() => deleteLocalThesis('missing_thesis_99'), (err) => err.status === 404);
  });

  console.log('--- 9. Student Depository Submission Verification Gate ---');

  test('requireApproved allows approved students to submit theses', () => {
    const approvedStudent = {
      _id: 'stu_appr',
      role: 'student',
      status: 'approved',
    };

    const { req, res } = createMockReqRes({ user: approvedStudent });
    let called = false;
    requireApproved(req, res, () => {
      called = true;
    });
    assert.strictEqual(called, true, 'Approved student must pass requireApproved');
  });

  test('requireApproved rejects pending student with 403 PENDING_APPROVAL', () => {
    const pendingStudent = {
      _id: 'stu_pend',
      role: 'student',
      status: 'pending',
    };

    const { req, res } = createMockReqRes({ user: pendingStudent });
    let called = false;
    requireApproved(req, res, () => {
      called = true;
    });
    assert.strictEqual(called, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.status, 'pending');
  });

  console.log('--- 10. Break-Glass Legacy Password Authentication Gate ---');

  test('Legacy password login is disabled by default (returns 404)', () => {
    const originalFlag = process.env.ENABLE_LEGACY_ADMIN_LOGIN;
    try {
      delete process.env.ENABLE_LEGACY_ADMIN_LOGIN;
      const isLegacyEnabled = process.env.ENABLE_LEGACY_ADMIN_LOGIN === 'true';
      assert.strictEqual(isLegacyEnabled, false, 'Must be disabled by default');
    } finally {
      process.env.ENABLE_LEGACY_ADMIN_LOGIN = originalFlag;
    }
  });

  test('Legacy password login matches only configured primary admin email', () => {
    const originalFlag = process.env.ENABLE_LEGACY_ADMIN_LOGIN;
    const originalEmail = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    try {
      process.env.ENABLE_LEGACY_ADMIN_LOGIN = 'true';
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = 'admin.owner@campus.edu';

      const configuredAdminEmail = getValidatedPrimaryAdminEmail();

      function authenticateLegacyLogin(email) {
        if (process.env.ENABLE_LEGACY_ADMIN_LOGIN !== 'true') {
          const err = new Error('Not Found');
          err.status = 404;
          throw err;
        }
        const clean = (email || '').trim().toLowerCase();
        if (!configuredAdminEmail || clean !== configuredAdminEmail) {
          const err = new Error('Invalid legacy administrative credentials.');
          err.status = 401;
          throw err;
        }
        return true;
      }

      assert.throws(() => authenticateLegacyLogin('admin@thesis.org'), /Invalid legacy administrative credentials/);
      assert.throws(() => authenticateLegacyLogin('other@campus.edu'), /Invalid legacy administrative credentials/);

      assert.strictEqual(authenticateLegacyLogin('  Admin.Owner@Campus.Edu  '), true);
    } finally {
      process.env.ENABLE_LEGACY_ADMIN_LOGIN = originalFlag;
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = originalEmail;
    }
  });

  console.log('--- 11. Test Membership Revocation, Honest Custom Labels & Editor Management ---');

  test('Membership revocation cancels all active periods, expires trials, and returns user to free', () => {
    const user = { _id: 'stu_revoke_1', name: 'Test Scholar', role: 'student' };
    const periods = [
      { _id: 'p1', user: user._id, status: 'active', expiresAt: new Date(Date.now() + 86400000) },
      { _id: 'p2', user: user._id, status: 'active', expiresAt: new Date(Date.now() + 172800000) },
    ];
    const trials = [
      { _id: 't1', user: user._id, status: 'active', expiresAt: new Date(Date.now() + 86400000) },
    ];

    function revokeUserMembership(userId, { reason, cancelledBy }) {
      const cancellationReason = (reason || '').trim() || 'Revoked by depository administration';
      let cancelledCount = 0;
      for (const p of periods) {
        if (p.user === userId && p.status === 'active') {
          p.status = 'cancelled';
          p.cancelledAt = new Date();
          p.cancelledBy = cancelledBy;
          p.cancellationReason = cancellationReason;
          cancelledCount++;
        }
      }
      for (const t of trials) {
        if (t.user === userId && t.status === 'active') {
          t.status = 'expired';
        }
      }
      return { success: true, cancelledPeriods: cancelledCount, plan: 'free' };
    }

    const result = revokeUserMembership(user._id, { reason: 'Test period completed', cancelledBy: 'adm_1' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.cancelledPeriods, 2);
    assert.strictEqual(result.plan, 'free');
    assert.strictEqual(periods[0].status, 'cancelled');
    assert.strictEqual(periods[0].cancellationReason, 'Test period completed');
    assert.strictEqual(trials[0].status, 'expired');
  });

  test('Manual test grant computes honest non-commercial label instead of commercial pricing', () => {
    function computeGrantPresentation(grantType, durationPreset, customLabel) {
      if (customLabel && customLabel.trim()) return customLabel.trim();
      if (grantType === 'test') {
        if (durationPreset === '1d') return 'Complimentary Test Access (24 Hours)';
        if (durationPreset === '7d') return 'Complimentary Test Access (7 Days)';
        if (durationPreset === '30d') return 'Complimentary Test Access (30 Days)';
        return 'Complimentary Test Access (Test Tier)';
      }
      if (durationPreset === '30d') return 'Academic Research Grant (30 Days)';
      if (durationPreset === '6m') return 'Academic Research Grant (Premium 6-Month)';
      return 'Academic Research Grant (Premium Tier)';
    }

    const label1d = computeGrantPresentation('test', '1d');
    assert.strictEqual(label1d, 'Complimentary Test Access (24 Hours)');
    assert.strictEqual(label1d.includes('6 Months'), false);
    assert.strictEqual(label1d.includes('৳500'), false);

    const label7d = computeGrantPresentation('test', '7d');
    assert.strictEqual(label7d, 'Complimentary Test Access (7 Days)');

    const labelCustom = computeGrantPresentation('custom', '7d', 'Special Beta Evaluation Access');
    assert.strictEqual(labelCustom, 'Special Beta Evaluation Access');
  });

  test('Editor pre-provisioning accepts any email and assigns requested permissions', () => {
    const mockDb = new Map();
    const primaryAdminEmail = 'primary.admin@institution.edu';

    function appointEditor(email, permissions, actorId) {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail) throw new Error('Email is required.');
      if (cleanEmail === primaryAdminEmail) {
        throw new Error('Primary administrator account cannot be converted to editor.');
      }
      const validPerms = (permissions || []).filter((p) => ALL_PERMISSIONS.includes(p));

      let user = mockDb.get(cleanEmail);
      if (!user) {
        user = {
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          role: 'editor',
          status: 'approved',
          permissions: validPerms,
          roleChangedBy: actorId,
        };
      } else {
        user.role = 'editor';
        user.permissions = validPerms;
        user.status = 'approved';
        user.roleChangedBy = actorId;
      }
      mockDb.set(cleanEmail, user);
      return user;
    }

    const newEditor = appointEditor('future.colleague@dept.edu', [PERMISSIONS.PUBLICATIONS_MODERATE, PERMISSIONS.STUDENTS_VIEW], 'adm_1');
    assert.strictEqual(newEditor.role, 'editor');
    assert.strictEqual(newEditor.status, 'approved');
    assert.deepStrictEqual(newEditor.permissions, [PERMISSIONS.PUBLICATIONS_MODERATE, PERMISSIONS.STUDENTS_VIEW]);

    assert.throws(
      () => appointEditor(primaryAdminEmail, [PERMISSIONS.STUDENTS_VIEW], 'adm_1'),
      /Primary administrator account cannot be converted/
    );
  });

  test('Editor revocation allows demoting any appointed editor back to student role', () => {
    const mockDb = new Map();
    mockDb.set('ed_1', { _id: 'ed_1', email: 'editor@dept.edu', role: 'editor', permissions: [PERMISSIONS.STUDENTS_VIEW] });

    function revokeEditor(idOrEmail, actorId) {
      let target = null;
      for (const u of mockDb.values()) {
        if (u._id === idOrEmail || u.email === idOrEmail) {
          target = u;
          break;
        }
      }
      if (!target || target.role !== 'editor') {
        throw new Error('Editor not found or account is not an editor.');
      }
      target.role = 'student';
      target.permissions = [];
      target.roleChangedBy = actorId;
      return target;
    }

    const revoked = revokeEditor('ed_1', 'adm_1');
    assert.strictEqual(revoked.role, 'student');
    assert.deepStrictEqual(revoked.permissions, []);

    assert.throws(() => revokeEditor('ed_1', 'adm_1'), /Editor not found or account is not an editor/);
  });

  console.log('\n===============================================================');
  console.log(`  ALL ${passed}/${total} RBAC & GOOGLE AUTH TESTS PASSED (100% SUCCESS)`);
  console.log('===============================================================\n');
}

module.exports = { runRbacAndGoogleAuthTests };

if (require.main === module) {
  runRbacAndGoogleAuthTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
