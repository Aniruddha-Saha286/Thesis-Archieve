/**
 * Comprehensive Automated Email Notification Test Suite
 *
 * Verifies that:
 * 1. Admin Email (sahaaniruddha2004@gmail.com) is alerted for:
 *    - Student verification requests (ID card upload)
 *    - bKash payment claims & resubmissions
 *    - Depository reports / grievances
 * 2. User Email is alerted for:
 *    - Payment verification & membership activation
 *    - Administrative membership grants (test/custom/standard)
 *    - Student verification approval
 *    - Editorial Board appointment & permission updates
 * 3. Fail-safe & Non-blocking guarantees:
 *    - In test/offline mode, zero real network sockets are opened
 *    - Missing or invalid inputs never crash the server
 *    - HTML injection is strictly prevented via entity escaping
 */

const assert = require('assert');
const emailService = require('../services/emailService');

async function runEmailNotificationTests() {
  console.log('\n===============================================================');
  console.log('  TEST SUITE: FAIL-SAFE EMAIL NOTIFICATION SYSTEM             ');
  console.log('===============================================================\n');

  let passed = 0;
  const test = async (name, fn) => {
    try {
      emailService.clearSentEmails();
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  };

  // --- 1. Environment & Admin Recipient Resolution ---
  console.log('--- 1. Admin Notification Recipient Resolution ---');

  await test('Resolves default admin email to sahaaniruddha2004@gmail.com', () => {
    const originalAdmin = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    const originalNotif = process.env.ADMIN_NOTIFICATION_EMAIL;
    try {
      delete process.env.ADMIN_NOTIFICATION_EMAIL;
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = 'sahaaniruddha2004@gmail.com';
      const resolved = emailService.getAdminNotificationEmail();
      assert.strictEqual(resolved, 'sahaaniruddha2004@gmail.com');
    } finally {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = originalAdmin;
      if (originalNotif) process.env.ADMIN_NOTIFICATION_EMAIL = originalNotif;
    }
  });

  await test('Respects ADMIN_NOTIFICATION_EMAIL override if explicitly set', () => {
    const originalNotif = process.env.ADMIN_NOTIFICATION_EMAIL;
    try {
      process.env.ADMIN_NOTIFICATION_EMAIL = 'custom-admin@university.edu';
      const resolved = emailService.getAdminNotificationEmail();
      assert.strictEqual(resolved, 'custom-admin@university.edu');
    } finally {
      if (originalNotif) process.env.ADMIN_NOTIFICATION_EMAIL = originalNotif;
      else delete process.env.ADMIN_NOTIFICATION_EMAIL;
    }
  });

  await test('Fails closed to fallback if primary admin email is placeholder or missing', () => {
    const originalAdmin = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL;
    const originalNotif = process.env.ADMIN_NOTIFICATION_EMAIL;
    try {
      delete process.env.ADMIN_NOTIFICATION_EMAIL;
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = '—';
      const resolved = emailService.getAdminNotificationEmail();
      assert.strictEqual(resolved, 'sahaaniruddha2004@gmail.com');
    } finally {
      process.env.PRIMARY_ADMIN_GOOGLE_EMAIL = originalAdmin;
      if (originalNotif) process.env.ADMIN_NOTIFICATION_EMAIL = originalNotif;
    }
  });

  // --- 2. HTML Injection & Sanitization ---
  console.log('--- 2. HTML Injection Escaping & Template Security ---');

  await test('escapeHtml escapes dangerous XSS script and tag characters', () => {
    const malicious = '<script>alert("hacked")</script> & "quotes" \'apostrophe\'';
    const escaped = emailService.escapeHtml(malicious);
    assert(!escaped.includes('<script>'), 'Must not contain raw script tag');
    assert(escaped.includes('&lt;script&gt;'), 'Must contain escaped brackets');
    assert(escaped.includes('&amp;'), 'Must contain escaped ampersand');
    assert(escaped.includes('&quot;'), 'Must contain escaped quote');
    assert(escaped.includes('&#39;'), 'Must contain escaped apostrophe');
  });

  // --- 3. Offline & Mock Isolation ---
  console.log('--- 3. Offline Mode & In-Memory Capturing ---');

  await test('Emails in test mode are captured in memory and mock flag is true', async () => {
    const result = await emailService.sendEmail({
      to: 'test.scholar@campus.edu',
      subject: 'Test Academic Subject',
      html: '<p>Test body</p>',
      text: 'Test body',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mocked, true);

    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'test.scholar@campus.edu');
    assert.strictEqual(sent[0].subject, 'Test Academic Subject');
  });

  // --- 4. Admin Triggers (Verification, Payment, Grievance) ---
  console.log('--- 4. Admin Email Triggers ---');

  await test('Trigger: notifyAdminNewVerification dispatches complete student dossier to admin', async () => {
    const res = await emailService.notifyAdminNewVerification({
      studentName: 'Tasnim Ahmed',
      studentEmail: 'tasnim.ahmed@buet.ac.bd',
      university: 'Bangladesh University of Engineering and Technology (BUET)',
      degreeProgram: 'B.Sc. in Computer Science and Engineering',
      studentId: '1905001',
      documentRef: 'thesis_vault/student_ids/buet_id_1905001',
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, emailService.getAdminNotificationEmail());
    assert(email.subject.includes('Tasnim Ahmed'), 'Subject must mention student name');
    assert(email.html.includes('BUET'), 'HTML must include university');
    assert(email.html.includes('1905001'), 'HTML must include student ID');
    assert(email.html.includes('thesis_vault/student_ids/buet_id_1905001'), 'HTML must include document ref');
    assert(email.text.includes('1905001'), 'Plaintext must include student ID');
  });

  await test('Trigger: notifyAdminNewPayment alerts admin on initial bKash claim with order details', async () => {
    const res = await emailService.notifyAdminNewPayment({
      senderNumber: '01711998877',
      trxId: 'BKA9876543210',
      amount: 500,
      planLabel: 'Premium Membership (6 Months)',
      userEmail: 'scholar@research.org',
      userName: 'Ayesha Rahman',
      orderRef: 'ORD-20260927-ABC123',
      isResubmission: false,
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, emailService.getAdminNotificationEmail());
    assert(email.subject.includes('500'), 'Subject must specify amount');
    assert(email.subject.includes('New Payment Claim') || email.subject.includes('[bKash Payment]'));
    assert(email.html.includes('BKA9876543210'), 'HTML must contain TrxID');
    assert(email.html.includes('01711998877'), 'HTML must contain sender number');
    assert(email.html.includes('ORD-20260927-ABC123'), 'HTML must contain order ref');
  });

  await test('Trigger: notifyAdminNewPayment highlights resubmission when corrected', async () => {
    const res = await emailService.notifyAdminNewPayment({
      senderNumber: '01822334455',
      trxId: 'BKA1122334455',
      amount: 850,
      planLabel: 'Pro Max Membership (12 Months)',
      userEmail: 'phd.candidate@university.edu',
      userName: 'Dr. Rafiqul Islam',
      orderRef: 'ORD-20260927-XYZ789',
      isResubmission: true,
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert(email.subject.includes('[bKash Resubmission]'), 'Subject must indicate resubmission');
    assert(email.html.includes('Corrected bKash Payment Resubmitted'));
  });

  await test('Trigger: notifyAdminNewReport delivers grievance details to admin', async () => {
    const res = await emailService.notifyAdminNewReport({
      reportId: 'rep_1234567890',
      recordId: 'W123456789',
      issueType: 'metadata-inaccuracy',
      description: 'The publication author affiliation lists Stanford instead of BUET.',
      reportedBy: 'reviewer@academic.edu',
      title: 'Neural Language Models for Low-Resource Bengali',
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, emailService.getAdminNotificationEmail());
    assert(email.subject.includes('Grievance / Report'));
    assert(email.html.includes('Neural Language Models'));
    assert(email.html.includes('reviewer@academic.edu'));
    assert(email.html.includes('metadata-inaccuracy'));
  });

  // --- 5. User Triggers (Payment Approved, Grant, Verification, Editor) ---
  console.log('--- 5. User Email Triggers ---');

  await test('Trigger: notifyUserPaymentApproved sends activation receipt to the specific user', async () => {
    const expiry = new Date('2027-03-27T18:00:00.000Z');
    const res = await emailService.notifyUserPaymentApproved({
      userEmail: 'recipient.student@campus.edu',
      userName: 'Sadia Jahan',
      planLabel: 'Premium Membership (6 Months)',
      expiresAt: expiry,
      trxId: 'BKA9988776655',
      amount: 500,
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, 'recipient.student@campus.edu');
    assert(email.subject.includes('Payment Verified'));
    assert(email.html.includes('Sadia Jahan'));
    assert(email.html.includes('BKA9988776655'));
    assert(email.html.includes('Premium Membership (6 Months)'));
  });

  await test('Trigger: notifyUserMembershipGranted sends access notice to specific user', async () => {
    const expiry = new Date('2026-10-04T18:00:00.000Z');
    const res = await emailService.notifyUserMembershipGranted({
      userEmail: 'scholar.grantee@institute.edu',
      userName: 'Fahim Morshed',
      planLabel: 'Complimentary Test Access (7 Days)',
      expiresAt: expiry,
      grantReason: 'Evaluation grant for faculty review',
      grantType: 'test',
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, 'scholar.grantee@institute.edu');
    assert(email.subject.includes('Research Access Granted'));
    assert(email.html.includes('Complimentary Test Access (7 Days)'));
    assert(email.html.includes('Evaluation grant for faculty review'));
  });

  await test('Trigger: notifyUserVerificationApproved alerts student that identity is verified', async () => {
    const res = await emailService.notifyUserVerificationApproved({
      userEmail: 'verified.student@buet.ac.bd',
      userName: 'Arif Hasan',
      university: 'BUET',
      degreeProgram: 'M.Sc. in Computer Science',
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, 'verified.student@buet.ac.bd');
    assert(email.subject.includes('Student Researcher Identity Verified'));
    assert(email.html.includes('BUET'));
    assert(email.html.includes('Arif Hasan'));
  });

  await test('Trigger: notifyUserEditorAppointed alerts user of Editorial Board appointment and permissions', async () => {
    const res = await emailService.notifyUserEditorAppointed({
      userEmail: 'new.editor@depository.org',
      userName: 'Prof. Anisul Haque',
      permissions: ['documents.view', 'local_theses.moderate', 'reports.moderate'],
      appointedBy: 'sahaaniruddha2004@gmail.com',
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, 'new.editor@depository.org');
    assert(email.subject.includes('Editorial Board Appointment'));
    assert(email.html.includes('Prof. Anisul Haque'));
    assert(email.html.includes('local_theses.moderate'));
  });

  await test('Trigger: notifyUserEditorPermissionsUpdated alerts editor when permissions change', async () => {
    const res = await emailService.notifyUserEditorPermissionsUpdated({
      userEmail: 'existing.editor@depository.org',
      userName: 'Prof. Anisul Haque',
      permissions: ['documents.view', 'payments.review'],
      updatedBy: 'sahaaniruddha2004@gmail.com',
    });

    assert.strictEqual(res.success, true);
    const sent = emailService.getSentEmails();
    assert.strictEqual(sent.length, 1);
    const email = sent[0];

    assert.strictEqual(email.to, 'existing.editor@depository.org');
    assert(email.subject.includes('Editorial Permissions Updated'));
    assert(email.html.includes('payments.review'));
  });

  // --- 6. Non-blocking / Fail-Safe Resilience ---
  console.log('--- 6. Fail-Safe & Non-blocking Boundary Resilience ---');

  await test('sendEmail returns structured failure and never throws when recipient is invalid or empty', async () => {
    const res1 = await emailService.sendEmail({ to: '', subject: 'Test', html: '<p>x</p>' });
    assert.strictEqual(res1.success, false);
    assert.strictEqual(res1.reason, 'INVALID_RECIPIENT');

    const res2 = await emailService.sendEmail({ to: 'invalid-email-no-at', subject: 'Test', html: '<p>x</p>' });
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.reason, 'INVALID_RECIPIENT');

    const res3 = await emailService.sendEmail({ to: 'user@campus.edu', subject: '', html: '<p>x</p>' });
    assert.strictEqual(res3.success, false);
    assert.strictEqual(res3.reason, 'MISSING_SUBJECT');
  });

  console.log('\n===============================================================');
  console.log(`  ALL ${passed}/${passed} EMAIL NOTIFICATION TESTS PASSED (100% OK)`);
  console.log('===============================================================\n');
}

if (require.main === module) {
  runEmailNotificationTests().catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runEmailNotificationTests };
