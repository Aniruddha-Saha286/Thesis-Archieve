const nodemailer = require('nodemailer');
const { getValidatedPrimaryAdminEmail } = require('./googleIdentityService');
const { formatDhakaDateTime } = require('../utils/dhakaDate');

/**
 * In-memory buffer for captured emails during testing, offline mode,
 * or when SMTP is unconfigured.
 */
let sentEmails = [];
let cachedTransporter = null;

/**
 * Escapes user-supplied content to prevent HTML injection in emails.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates basic email syntax.
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Determines whether SMTP credentials are fully configured.
 */
function isSmtpConfigured() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(
    user &&
    pass &&
    user !== '—' &&
    pass !== '—' &&
    !user.includes('your_email') &&
    !pass.includes('your_gmail')
  );
}

/**
 * Evaluates whether email dispatch should operate in mock/offline mode.
 */
function isMockMode() {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.OFFLINE_MODE === 'true' ||
    !isSmtpConfigured()
  );
}

/**
 * Resolves the primary administrator email address for receiving administrative alerts.
 * Priority: ADMIN_NOTIFICATION_EMAIL -> PRIMARY_ADMIN_GOOGLE_EMAIL -> fallback.
 */
function getAdminNotificationEmail() {
  const custom = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (custom && isValidEmail(custom)) {
    return custom.trim().toLowerCase();
  }
  const primaryAdmin = getValidatedPrimaryAdminEmail();
  if (primaryAdmin && isValidEmail(primaryAdmin)) {
    return primaryAdmin;
  }
  return 'sahaaniruddha2004@gmail.com';
}

/**
 * Returns or initializes the nodemailer transport instance.
 */
function getTransporter() {
  if (!isSmtpConfigured() || isMockMode()) {
    return null;
  }

  if (!cachedTransporter) {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT, 10) || 465;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }

  return cachedTransporter;
}

/**
 * Core dispatch function.
 * Guaranteed to be non-blocking and fail-safe: catches all exceptions and never rejects unhandled.
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    if (!to || !isValidEmail(to)) {
      console.warn(`[EmailService] Invalid or missing recipient email: "${to}". Email skipped.`);
      return { success: false, reason: 'INVALID_RECIPIENT' };
    }

    if (!subject || !subject.trim()) {
      console.warn(`[EmailService] Missing email subject. Email skipped.`);
      return { success: false, reason: 'MISSING_SUBJECT' };
    }

    const fromAddress = process.env.EMAIL_FROM || `"The Thesis Archive" <${getAdminNotificationEmail()}>`;

    const mailOptions = {
      from: fromAddress,
      to: to.trim().toLowerCase(),
      subject: subject.trim(),
      html,
      text,
    };

    // Deterministic Mock / Offline Capture
    if (isMockMode()) {
      sentEmails.push({
        ...mailOptions,
        sentAt: new Date(),
        mocked: true,
      });

      if (process.env.NODE_ENV !== 'test') {
        console.log(`[EmailService] [OFFLINE/MOCK] Outgoing email captured for ${to}: "${subject}"`);
      }

      return {
        success: true,
        mocked: true,
        messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
    }

    const transport = getTransporter();
    if (!transport) {
      sentEmails.push({
        ...mailOptions,
        sentAt: new Date(),
        mocked: true,
      });
      return { success: true, mocked: true, messageId: `mock-fallback-${Date.now()}` };
    }

    const info = await transport.sendMail(mailOptions);
    console.log(`[EmailService] Email sent successfully to ${to} (Message ID: ${info.messageId})`);
    return { success: true, mocked: false, messageId: info.messageId };
  } catch (err) {
    console.error(`[EmailService] Delivery error to ${to}:`, err.message);
    // CRITICAL: Return fail-safe structured result. Never bubble up unhandled error.
    return { success: false, error: err.message };
  }
}

/**
 * Standard Email Shell Generator for clean academic styling.
 */
function buildHtmlTemplate({ badgeLabel, badgeBg = '#FEF3C7', badgeColor = '#92400E', title, introText, items = [], footerNote, actionButton }) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 14px; font-weight: 600; color: #4B5563; font-size: 13px; width: 34%; border-bottom: 1px solid #F3F4F6; vertical-align: top;">
          ${escapeHtml(item.label)}
        </td>
        <td style="padding: 10px 14px; color: #111827; font-size: 14px; border-bottom: 1px solid #F3F4F6; vertical-align: top; word-break: break-word;">
          ${item.isHtml ? item.value : escapeHtml(item.value)}
        </td>
      </tr>
    `
    )
    .join('');

  const actionBlock = actionButton
    ? `
      <div style="margin-top: 24px; text-align: center;">
        <a href="${escapeHtml(actionButton.url)}" style="display: inline-block; background-color: #1C1B18; color: #F59E0B; font-weight: 600; font-size: 14px; padding: 12px 24px; text-decoration: none; border-radius: 6px; border: 1px solid #D97706;">
          ${escapeHtml(actionButton.text)}
        </a>
      </div>
    `
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background-color: #1C1B18; padding: 24px 28px; border-bottom: 3px solid #D97706;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: #F59E0B; text-transform: uppercase;">
        The Thesis Archive
      </div>
      <div style="font-size: 20px; font-weight: 700; color: #FFFFFF; margin-top: 4px; font-family: Georgia, Cambria, 'Times New Roman', serif;">
        Depository Governance &amp; Notification Service
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 28px;">
      
      <!-- Badge & Title -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.04em;">
          ${escapeHtml(badgeLabel)}
        </span>
      </div>

      <h2 style="margin: 0 0 12px 0; color: #111827; font-size: 18px; font-weight: 600; font-family: Georgia, Cambria, 'Times New Roman', serif;">
        ${escapeHtml(title)}
      </h2>

      <p style="margin: 0 0 20px 0; color: #374151; font-size: 14px; line-height: 1.6;">
        ${introText}
      </p>

      <!-- Details Table -->
      <table style="width: 100%; border-collapse: collapse; background-color: #FAFAFA; border: 1px solid #E5E7EB; border-radius: 6px; overflow: hidden; margin-bottom: 20px;">
        <tbody>
          ${rows}
        </tbody>
      </table>

      ${actionBlock}

      ${footerNote ? `<p style="margin: 20px 0 0 0; color: #6B7280; font-size: 12px; line-height: 1.5; font-style: italic;">${escapeHtml(footerNote)}</p>` : ''}
    </div>

    <!-- Depository Footer -->
    <div style="background-color: #F9FAFB; padding: 16px 28px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #9CA3AF; text-align: center;">
      <p style="margin: 0 0 4px 0;">
        The Thesis Archive — theses and research papers in one search
      </p>
      <p style="margin: 0; font-size: 11px;">
        Automated Depository Notice &bull; Asia/Dhaka Standard Time &bull; Do not reply directly to this automated email.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

// =========================================================================
// 1. ADMIN NOTIFICATIONS
// =========================================================================

/**
 * 1. Alerts Admin when a student submits an identity verification document / ID card.
 */
async function notifyAdminNewVerification({ studentName, studentEmail, university, degreeProgram, studentId, documentRef }) {
  const adminEmail = getAdminNotificationEmail();
  const subject = `[Action Required] Student Verification Request — ${studentName || studentEmail}`;

  const html = buildHtmlTemplate({
    badgeLabel: 'Verification Request',
    badgeBg: '#FEF3C7',
    badgeColor: '#92400E',
    title: 'Student Identity Verification Submitted',
    introText: 'A student researcher has uploaded academic identity credentials and is awaiting administrative review to access student depository privileges.',
    items: [
      { label: 'Student Name', value: studentName || 'Not specified' },
      { label: 'Student Email', value: studentEmail || 'Not specified' },
      { label: 'University / Institution', value: university || 'Pending submission' },
      { label: 'Degree Program', value: degreeProgram || 'B.Sc. Undergraduate Thesis' },
      { label: 'Student ID Number', value: studentId || 'Not provided' },
      { label: 'Credential Document', value: documentRef ? `Stored in Secure Vault (Ref: ${documentRef})` : 'ID Card Attached' },
      { label: 'Submission Timestamp', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'Please log in to the Administrative Management Portal to inspect the credential document and either approve or decline student privileges.',
  });

  const text = `
[The Thesis Archive - Action Required]
New Student Identity Verification Request

A student researcher has submitted identity credentials for verification:
- Student Name: ${studentName || 'Not specified'}
- Student Email: ${studentEmail || 'Not specified'}
- University: ${university || 'Pending submission'}
- Degree Program: ${degreeProgram || 'B.Sc. Undergraduate Thesis'}
- Student ID: ${studentId || 'Not provided'}
- Credential Document: ${documentRef ? `Ref: ${documentRef}` : 'ID Card Proof'}
- Timestamp: ${formatDhakaDateTime(new Date())}

Log in to the Admin Portal to review and approve.
  `.trim();

  return sendEmail({ to: adminEmail, subject, html, text });
}

/**
 * 2. Alerts Admin when a student submits or resubmits a bKash payment request.
 */
async function notifyAdminNewPayment({ senderNumber, trxId, amount, planLabel, userEmail, userName, orderRef, isResubmission = false }) {
  const adminEmail = getAdminNotificationEmail();
  const subjectPrefix = isResubmission ? '[bKash Resubmission]' : '[bKash Payment]';
  const subject = `${subjectPrefix} Payment Claim Submitted — ৳${amount} (${planLabel})`;

  const html = buildHtmlTemplate({
    badgeLabel: isResubmission ? 'Payment Resubmission' : 'New Payment Claim',
    badgeBg: '#E0E7FF',
    badgeColor: '#3730A3',
    title: isResubmission ? 'Corrected bKash Payment Resubmitted' : 'New bKash Payment Claim Received',
    introText: 'A researcher has submitted a manual bKash transaction for membership verification and subscription activation.',
    items: [
      { label: 'Researcher Name', value: userName || 'Scholar' },
      { label: 'Researcher Email', value: userEmail || 'Not specified' },
      { label: 'Order Reference', value: orderRef || 'N/A' },
      { label: 'bKash TrxID', value: trxId },
      { label: 'Claimed Amount', value: `৳${amount} BDT` },
      { label: 'Sender Mobile No.', value: senderNumber || 'Not specified' },
      { label: 'Selected Plan', value: planLabel || 'Premium Membership' },
      { label: 'Submission Time', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'Please reconcile this transaction against the bKash Merchant statement in the Admin Merchant Desk before approving membership.',
  });

  const text = `
[The Thesis Archive]
${subject}

A bKash payment claim has been submitted:
- Researcher: ${userName || 'Scholar'} (${userEmail || 'N/A'})
- Order Reference: ${orderRef || 'N/A'}
- bKash TrxID: ${trxId}
- Claimed Amount: ৳${amount} BDT
- Sender Mobile No.: ${senderNumber || 'Not specified'}
- Membership Plan: ${planLabel}
- Submission Time: ${formatDhakaDateTime(new Date())}

Reconcile against bKash merchant statement and approve in the Admin Merchant Desk.
  `.trim();

  return sendEmail({ to: adminEmail, subject, html, text });
}

/**
 * 3. Alerts Admin when a user raises a complaint / report on a thesis or paper.
 */
async function notifyAdminNewReport({ reportId, recordId, issueType, description, reportedBy, title }) {
  const adminEmail = getAdminNotificationEmail();
  const subject = `[Grievance / Report] Publication Issue Reported — ${title ? title.slice(0, 50) : 'Depository Record'}`;

  const html = buildHtmlTemplate({
    badgeLabel: 'Depository Report',
    badgeBg: '#FEE2E2',
    badgeColor: '#991B1B',
    title: 'Publication Metadata or Access Grievance Reported',
    introText: 'A user or researcher has submitted a formal report regarding a publication in the depository catalog.',
    items: [
      { label: 'Publication Title', value: title || 'Scholarly Record' },
      { label: 'Record Identifier', value: String(recordId || 'N/A') },
      { label: 'Issue Category', value: issueType || 'dead-link' },
      { label: 'Reported By', value: reportedBy || 'Anonymous Scholar' },
      { label: 'Description', value: description || 'No detailed remarks provided.' },
      { label: 'Report ID', value: String(reportId || 'N/A') },
      { label: 'Reported Time', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'Please inspect the publication in the Admin Grievance & Reports queue to determine whether metadata repair, link correction, or moderation is required.',
  });

  const text = `
[The Thesis Archive - Depository Grievance]
${subject}

A report has been lodged for review:
- Publication Title: ${title || 'Scholarly Record'}
- Record ID: ${recordId || 'N/A'}
- Issue Category: ${issueType || 'dead-link'}
- Reported By: ${reportedBy || 'Anonymous'}
- Description: ${description || 'No detailed remarks'}
- Timestamp: ${formatDhakaDateTime(new Date())}

Review and resolve in Admin Portal -> Grievance & Reports Desk.
  `.trim();

  return sendEmail({ to: adminEmail, subject, html, text });
}

/**
 * Alerts Admin when a signed-in user sends a message to the team (bug, idea, complaint, question).
 * Fail-safe: any problem while building or sending is logged and returned, never thrown,
 * so the user's message is still saved and answered normally.
 */
async function notifyAdminNewFeedback({ feedbackId, category, categoryLabel, message, pageContext, userName, userEmail } = {}) {
  try {
    const adminEmail = getAdminNotificationEmail();
    const label = categoryLabel || category || 'Feedback';
    // A name is typed by the user, so keep it on one line and short before it goes in the subject.
    const sender = String(userName || userEmail || 'A user').replace(/\s+/g, ' ').trim().slice(0, 60);
    const subject = `[Feedback] ${label} — from ${sender}`;
    const body = String(message || '').trim() || 'No message text.';

    const html = buildHtmlTemplate({
      badgeLabel: 'User Feedback',
      badgeBg: '#E0E7FF',
      badgeColor: '#3730A3',
      title: 'New Message from a User',
      introText: 'A signed-in user has sent a message to the team from inside The Thesis Archive.',
      items: [
        { label: 'From', value: userName || 'Not specified' },
        { label: 'Email', value: userEmail || 'Not specified' },
        { label: 'About', value: label },
        // Escaped first, then line breaks restored, so the message keeps its paragraphs safely.
        { label: 'Message', value: escapeHtml(body).replace(/\n/g, '<br>'), isHtml: true },
        { label: 'Sent From Page', value: pageContext || 'Not specified' },
        { label: 'Feedback ID', value: String(feedbackId || 'N/A') },
        { label: 'Received At', value: formatDhakaDateTime(new Date()) },
      ],
      footerNote: 'Please open the feedback queue in the Admin Portal to reply. The user is notified in the app and by email when you answer.',
    });

    const text = `
[The Thesis Archive - User Feedback]
${subject}

A user has sent a message to the team:
- From: ${userName || 'Not specified'} (${userEmail || 'N/A'})
- About: ${label}
- Sent From Page: ${pageContext || 'Not specified'}
- Feedback ID: ${feedbackId || 'N/A'}
- Received At: ${formatDhakaDateTime(new Date())}

Message:
${body}

Reply from Admin Portal -> Feedback queue.
    `.trim();

    return await sendEmail({ to: adminEmail, subject, html, text });
  } catch (err) {
    console.error('[EmailService] Feedback notification build error:', err.message);
    return { success: false, error: err.message };
  }
}

// =========================================================================
// 2. USER NOTIFICATIONS (Confirmations & Approvals)
// =========================================================================

/**
 * Alerts User when their student identity verification request has been submitted.
 */
async function notifyUserVerificationRequested({ userEmail, userName, university, degreeProgram, studentId }) {
  const subject = `Verification Request Received — The Thesis Archive`;

  const html = buildHtmlTemplate({
    badgeLabel: 'Request Received',
    badgeBg: '#FEF3C7',
    badgeColor: '#92400E',
    title: 'Identity Verification Submission Received',
    introText: `Hello <strong>${escapeHtml(userName || 'Scholar')}</strong>,<br><br>We have successfully received your student identity credentials for academic verification. Our editorial board is currently reviewing your document.`,
    items: [
      { label: 'Student Name', value: userName || 'Scholar' },
      { label: 'University', value: university || 'Pending review' },
      { label: 'Degree Program', value: degreeProgram || 'B.Sc. Undergraduate Thesis' },
      { label: 'Student ID', value: studentId || 'Not provided' },
      { label: 'Status', value: 'Under Review by Depository Staff' },
      { label: 'Submitted At', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'You will receive another email confirmation as soon as your account verification is reviewed and approved by an administrator.',
  });

  const text = `
[The Thesis Archive]
Verification Request Received

Hello ${userName || 'Scholar'},

We have received your student identity credentials for ${university || 'academic review'}.
Our editorial staff is currently reviewing your submission.
You will receive another email notification as soon as your student researcher status is verified.
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * Alerts User when their bKash payment claim has been submitted.
 */
async function notifyUserPaymentSubmitted({ userEmail, userName, orderRef, trxId, amount, planLabel, isResubmission = false }) {
  const subjectPrefix = isResubmission ? 'Payment Resubmission Received' : 'Payment Claim Received';
  const subject = `${subjectPrefix} — ৳${amount} (${planLabel})`;

  const html = buildHtmlTemplate({
    badgeLabel: isResubmission ? 'Resubmission Under Review' : 'Payment Under Review',
    badgeBg: '#E0E7FF',
    badgeColor: '#3730A3',
    title: isResubmission ? 'Corrected bKash Payment Received' : 'bKash Payment Claim Received',
    introText: `Hello <strong>${escapeHtml(userName || 'Scholar')}</strong>,<br><br>Thank you for submitting your bKash payment claim. Our merchant desk is currently reconciling your transaction with our bKash statement.`,
    items: [
      { label: 'Order Reference', value: orderRef || 'N/A' },
      { label: 'bKash TrxID', value: trxId },
      { label: 'Amount Paid', value: `৳${amount} BDT` },
      { label: 'Selected Plan', value: planLabel || 'Premium Membership' },
      { label: 'Status', value: 'Reconciliation in Progress' },
      { label: 'Submitted At', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'Your research subscription will be automatically activated as soon as the merchant reconciliation is completed by administration.',
  });

  const text = `
[The Thesis Archive]
${subject}

Hello ${userName || 'Scholar'},

We have received your bKash payment claim:
- Order Reference: ${orderRef || 'N/A'}
- bKash TrxID: ${trxId}
- Amount: ৳${amount} BDT
- Plan: ${planLabel}
- Status: Under Review

You will receive an activation confirmation email as soon as your payment is approved.
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * Alerts User when their grievance report is submitted.
 */
async function notifyUserReportSubmitted({ userEmail, userName, title, issueType, reportId }) {
  if (!userEmail || userEmail === 'anonymous' || !isValidEmail(userEmail)) {
    return { success: false, reason: 'ANONYMOUS_REPORTER' };
  }
  const subject = `Grievance Report Acknowledged — ${title ? title.slice(0, 50) : 'Publication'}`;

  const html = buildHtmlTemplate({
    badgeLabel: 'Report Logged',
    badgeBg: '#F3F4F6',
    badgeColor: '#4B5563',
    title: 'Depository Issue Report Acknowledged',
    introText: `Hello <strong>${escapeHtml(userName || 'Scholar')}</strong>,<br><br>Thank you for bringing this issue to our attention. Your report has been logged and assigned to our depository moderation team.`,
    items: [
      { label: 'Publication', value: title || 'Scholarly Record' },
      { label: 'Issue Category', value: issueType || 'dead-link' },
      { label: 'Report Reference', value: String(reportId || 'N/A') },
      { label: 'Status', value: 'Assigned for Editorial Moderation' },
      { label: 'Logged At', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'Our editorial board will inspect the metadata and source links to correct or update the record accordingly.',
  });

  const text = `
[The Thesis Archive]
Report Acknowledged — ${title || 'Publication'}

Hello ${userName || 'Scholar'},

Thank you for reporting an issue regarding "${title}".
- Category: ${issueType || 'dead-link'}
- Report Reference: ${reportId || 'N/A'}
- Status: Assigned for Editorial Moderation

Our moderation team will review and resolve this publication issue.
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * 4. Alerts User when Admin approves their bKash payment.
 */
async function notifyUserPaymentApproved({ userEmail, userName, planLabel, expiresAt, trxId, amount }) {
  const subject = `Payment Verified — Your ${planLabel || 'Research Membership'} is Now Active!`;

  const html = buildHtmlTemplate({
    badgeLabel: 'Payment Approved',
    badgeBg: '#DEF7EC',
    badgeColor: '#03543F',
    title: 'bKash Payment Verified & Subscription Activated',
    introText: `Hello <strong>${escapeHtml(userName || 'Scholar')}</strong>,<br><br>Your bKash transaction has been reconciled and approved by the depository administration. Your research privileges are now fully active.`,
    items: [
      { label: 'Membership Plan', value: planLabel || 'Premium Membership' },
      { label: 'Active Through', value: formatDhakaDateTime(expiresAt) },
      { label: 'Reconciled TrxID', value: trxId || 'Verified' },
      { label: 'Reconciled Amount', value: amount ? `৳${amount} BDT` : 'Verified' },
      { label: 'Entitlements', value: 'Unlimited advanced queries, multi-format citations, batch exports, and research collections' },
    ],
    footerNote: 'Thank you for supporting open access scholarly research through The Thesis Archive.',
  });

  const text = `
[The Thesis Archive]
Payment Verified — Subscription Activated

Hello ${userName || 'Scholar'},

Your bKash transaction (${trxId || 'N/A'}, ৳${amount || ''}) has been verified by our editorial board.
- Membership Plan: ${planLabel || 'Premium Membership'}
- Active Through: ${formatDhakaDateTime(expiresAt)}
- Privileges: Full access to research workspace, citations, and scholarly collections.

Thank you for supporting The Thesis Archive!
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * 5. Alerts User when Admin manually grants or customizes a membership.
 */
async function notifyUserMembershipGranted({ userEmail, userName, planLabel, expiresAt, grantReason, grantType }) {
  const isTest = grantType === 'test' || /test/i.test(grantReason || '');
  const subject = `Research Access Granted — ${planLabel || 'Academic Access'}`;

  const html = buildHtmlTemplate({
    badgeLabel: isTest ? 'Test Access' : 'Research Grant',
    badgeBg: '#DEF7EC',
    badgeColor: '#03543F',
    title: 'Complimentary Depository Research Access Granted',
    introText: `Hello <strong>${escapeHtml(userName || 'Scholar')}</strong>,<br><br>The depository administration has granted you complimentary membership access to The Thesis Archive research ecosystem.`,
    items: [
      { label: 'Access Tier', value: planLabel || 'Academic Research Grant' },
      { label: 'Valid Through', value: formatDhakaDateTime(expiresAt) },
      { label: 'Grant Type', value: isTest ? 'Complimentary Evaluation / Test' : 'Academic Grant' },
      { label: 'Administrative Note', value: grantReason || 'Depository administrative grant' },
    ],
    footerNote: 'You now enjoy full access to scholarly discovery tools, batch bibliography exports, and priority repository access.',
  });

  const text = `
[The Thesis Archive]
Research Access Granted — ${planLabel}

Hello ${userName || 'Scholar'},

Depository administration has granted you complimentary membership access:
- Access Tier: ${planLabel || 'Academic Grant'}
- Valid Through: ${formatDhakaDateTime(expiresAt)}
- Note: "${grantReason || 'Depository administrative grant'}"

Enjoy your research sessions on The Thesis Archive!
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * 6. Alerts User when Admin approves their student identity verification.
 */
async function notifyUserVerificationApproved({ userEmail, userName, university, degreeProgram }) {
  const subject = `Student Researcher Identity Verified — The Thesis Archive`;

  const html = buildHtmlTemplate({
    badgeLabel: 'Identity Approved',
    badgeBg: '#DEF7EC',
    badgeColor: '#03543F',
    title: 'Student Credential Verification Approved',
    introText: `Hello <strong>${escapeHtml(userName || 'Scholar')}</strong>,<br><br>Your academic identity credentials have been reviewed and officially approved by the depository administration.`,
    items: [
      { label: 'Student Name', value: userName || 'Scholar' },
      { label: 'Institution', value: university || 'Verified Academic Institution' },
      { label: 'Academic Program', value: degreeProgram || 'Undergraduate / Graduate Program' },
      { label: 'Account Status', value: 'Approved Student Researcher' },
      { label: 'Enabled Features', value: 'Authoritative thesis submissions, research collections, and verified researcher badge' },
    ],
    footerNote: 'You may now submit and archive your own thesis manuscripts directly to the permanent university depository.',
  });

  const text = `
[The Thesis Archive]
Student Credential Verification Approved

Hello ${userName || 'Scholar'},

Your student identity credentials have been officially approved:
- University: ${university || 'Verified Academic Institution'}
- Program: ${degreeProgram || 'Academic Program'}
- Status: Approved Student Researcher

You can now submit thesis works and access student depository features.
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * 7. Alerts User when Admin appoints them to the Editorial Board.
 */
async function notifyUserEditorAppointed({ userEmail, userName, permissions = [], appointedBy }) {
  const subject = `Editorial Board Appointment — The Thesis Archive`;
  const formattedPerms = permissions.length > 0 ? permissions.join(', ') : 'Standard Editorial Capabilities';

  const html = buildHtmlTemplate({
    badgeLabel: 'Staff Appointment',
    badgeBg: '#E1EFFE',
    badgeColor: '#1E429F',
    title: 'Welcome to the Editorial Board',
    introText: `Hello <strong>${escapeHtml(userName || userEmail)}</strong>,<br><br>You have been formally appointed as an <strong>Editor</strong> on The Thesis Archive Editorial Board.`,
    items: [
      { label: 'Staff Role', value: 'Depository Editor' },
      { label: 'Assigned Capabilities', value: formattedPerms },
      { label: 'Appointed By', value: appointedBy || 'Depository Administrator' },
      { label: 'Effective Date', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'You may now sign in using your Google account to access staff moderation, manuscript review, and grievance management features.',
  });

  const text = `
[The Thesis Archive]
Editorial Board Appointment

Hello ${userName || userEmail},

You have been appointed as an Editor on The Thesis Archive Editorial Board:
- Role: Depository Editor
- Assigned Capabilities: ${formattedPerms}
- Appointed By: ${appointedBy || 'Administrator'}
- Effective Date: ${formatDhakaDateTime(new Date())}

Sign in with your Google account to access staff tools.
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * 8. Alerts User when Admin updates their editorial permissions.
 */
async function notifyUserEditorPermissionsUpdated({ userEmail, userName, permissions = [], updatedBy }) {
  const subject = `Editorial Permissions Updated — The Thesis Archive`;
  const formattedPerms = permissions.length > 0 ? permissions.join(', ') : 'No granular permissions assigned';

  const html = buildHtmlTemplate({
    badgeLabel: 'Permissions Updated',
    badgeBg: '#E1EFFE',
    badgeColor: '#1E429F',
    title: 'Staff Editorial Permissions Updated',
    introText: `Hello <strong>${escapeHtml(userName || userEmail)}</strong>,<br><br>Your staff capabilities on The Thesis Archive have been modified by the depository administrator.`,
    items: [
      { label: 'Staff Role', value: 'Depository Editor' },
      { label: 'Current Capabilities', value: formattedPerms },
      { label: 'Updated By', value: updatedBy || 'Depository Administrator' },
      { label: 'Update Timestamp', value: formatDhakaDateTime(new Date()) },
    ],
    footerNote: 'The changes take effect immediately on your next request or session refresh.',
  });

  const text = `
[The Thesis Archive]
Editorial Permissions Updated

Hello ${userName || userEmail},

Your editorial capabilities on The Thesis Archive have been updated:
- Current Capabilities: ${formattedPerms}
- Updated By: ${updatedBy || 'Administrator'}
- Timestamp: ${formatDhakaDateTime(new Date())}
  `.trim();

  return sendEmail({ to: userEmail, subject, html, text });
}

/**
 * Alerts User when the team replies to a message they sent from the feedback form.
 * Fail-safe: any problem while building or sending is logged and returned, never thrown,
 * so the reply is still saved and shown in the app.
 */
async function notifyUserFeedbackReply({ userEmail, userName, categoryLabel, originalMessage, reply } = {}) {
  try {
    if (!userEmail || !isValidEmail(userEmail)) {
      return { success: false, reason: 'NO_RECIPIENT' };
    }
    const subject = `Reply to Your Feedback — The Thesis Archive`;
    const replyText = String(reply || '').trim();
    const original = String(originalMessage || '').trim();

    const html = buildHtmlTemplate({
      badgeLabel: 'Reply Received',
      badgeBg: '#DEF7EC',
      badgeColor: '#03543F',
      title: 'We Have Replied to Your Message',
      introText: `Hello <strong>${escapeHtml(userName || 'Scholar')}</strong>,<br><br>Thank you for writing to us. Our team has read your message and replied below.`,
      items: [
        { label: 'About', value: categoryLabel || 'Feedback' },
        // Escaped first, then line breaks restored, so both texts keep their paragraphs safely.
        { label: 'Your Message', value: escapeHtml(original || 'Not available').replace(/\n/g, '<br>'), isHtml: true },
        { label: 'Our Reply', value: escapeHtml(replyText).replace(/\n/g, '<br>'), isHtml: true },
        { label: 'Replied At', value: formatDhakaDateTime(new Date()) },
      ],
      footerNote: 'To continue the conversation, sign in to The Thesis Archive and send us a new message from the feedback form.',
    });

    const text = `
[The Thesis Archive]
Reply to Your Feedback

Hello ${userName || 'Scholar'},

Thank you for writing to us. Our team has replied to your message.

Your message:
${original || 'Not available'}

Our reply:
${replyText}

To continue the conversation, sign in to The Thesis Archive and send us a new message from the feedback form.
    `.trim();

    return await sendEmail({ to: userEmail, subject, html, text });
  } catch (err) {
    console.error('[EmailService] Feedback reply email build error:', err.message);
    return { success: false, error: err.message };
  }
}

// =========================================================================
// TEST & AUDIT HELPERS
// =========================================================================

function getSentEmails() {
  return [...sentEmails];
}

function clearSentEmails() {
  sentEmails = [];
}

function resetTransporterForTesting() {
  cachedTransporter = null;
}

module.exports = {
  sendEmail,
  isSmtpConfigured,
  isMockMode,
  getAdminNotificationEmail,
  notifyAdminNewVerification,
  notifyAdminNewPayment,
  notifyAdminNewReport,
  notifyAdminNewFeedback,
  notifyUserVerificationRequested,
  notifyUserPaymentSubmitted,
  notifyUserReportSubmitted,
  notifyUserPaymentApproved,
  notifyUserMembershipGranted,
  notifyUserVerificationApproved,
  notifyUserEditorAppointed,
  notifyUserEditorPermissionsUpdated,
  notifyUserFeedbackReply,
  getSentEmails,
  clearSentEmails,
  resetTransporterForTesting,
  escapeHtml,
};
