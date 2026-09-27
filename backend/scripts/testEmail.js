/**
 * Project Panther - SMTP Email Delivery Diagnostic Tool
 *
 * Usage:
 *   node backend/scripts/testEmail.js [optional_recipient]
 */

const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const nodemailer = require('nodemailer');

async function testEmailDelivery() {
  console.log('\n===============================================================');
  console.log('  PROJECT PANTHER - SMTP EMAIL DELIVERY DIAGNOSTIC TOOL       ');
  console.log('===============================================================\n');

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 465;
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const adminEmail = process.env.PRIMARY_ADMIN_GOOGLE_EMAIL || 'sahaaniruddha2004@gmail.com';
  const targetRecipient = process.argv[2] || adminEmail;

  console.log('Configuration Inspection:');
  console.log(`  SMTP_HOST:                 ${smtpHost}`);
  console.log(`  SMTP_PORT:                 ${smtpPort}`);
  console.log(`  SMTP_SECURE:               ${smtpSecure}`);
  console.log(`  SMTP_USER:                 ${smtpUser || '⚠️  NOT CONFIGURED'}`);
  console.log(`  SMTP_PASS:                 ${smtpPass ? '******** (configured)' : '⚠️  NOT CONFIGURED'}`);
  console.log(`  PRIMARY_ADMIN_GOOGLE_EMAIL: ${adminEmail}`);
  console.log(`  Target Recipient:          ${targetRecipient}`);
  console.log('');

  if (!smtpUser || !smtpPass || smtpUser === '—' || smtpPass === '—' || smtpUser.includes('your_email')) {
    console.error('❌ SMTP Credentials Missing in backend/.env!');
    console.error('');
    console.error('Why notifications are not arriving in your Gmail inbox:');
    console.error('Node.js cannot send real emails over the internet without authenticating');
    console.error('with an SMTP server (such as Gmail).');
    console.error('');
    console.error('To fix this and enable real email delivery to ' + adminEmail + ':');
    console.error('1. Go to your Google Account: https://myaccount.google.com/security');
    console.error('2. Ensure "2-Step Verification" is ON.');
    console.error('3. Search for "App Passwords" (or visit: https://myaccount.google.com/apppasswords)');
    console.error('4. Create a new App Password named "The Thesis Archive".');
    console.error('5. Copy the 16-character generated password (e.g. "abcd efgh ijkl mnop").');
    console.error('6. Add these lines to your backend/.env file:');
    console.error('');
    console.error('   SMTP_HOST=smtp.gmail.com');
    console.error('   SMTP_PORT=465');
    console.error('   SMTP_SECURE=true');
    console.error(`   SMTP_USER=${adminEmail}`);
    console.error('   SMTP_PASS=your_16_character_app_password');
    console.error(`   EMAIL_FROM="The Thesis Archive <${adminEmail}>"`);
    console.error('');
    console.error('7. Re-run this script: node backend/scripts/testEmail.js');
    console.error('===============================================================\n');
    process.exit(1);
  }

  console.log('Attempting SMTP connection and verification...');
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 10000,
  });

  try {
    await transporter.verify();
    console.log('✓ SMTP server connection verified successfully!\n');
  } catch (verifyErr) {
    console.error('❌ SMTP Connection / Authentication Failed:');
    console.error(verifyErr.message);
    console.error('\nCommon causes:');
    console.error('- Using normal Gmail password instead of a 16-character App Password');
    console.error('- 2-Step Verification is not enabled on the Google account');
    console.error('- Port blocked by local firewall or network provider');
    process.exit(1);
  }

  console.log(`Sending diagnostic test email to: ${targetRecipient}...`);
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"The Thesis Archive" <${smtpUser}>`,
      to: targetRecipient,
      subject: '[Test] The Thesis Archive Notification Diagnostic',
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px;">
          <h2 style="color: #D97706; margin-top: 0;">SMTP Test Successful!</h2>
          <p>This is a test notification from <strong>The Thesis Archive</strong> system.</p>
          <p>Your SMTP mailer is properly configured and outbound email notifications are functioning.</p>
          <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280;">Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
      text: 'SMTP Test Successful! Your mailer is properly configured and notifications are functioning.',
    });

    console.log('✓ Test email dispatched successfully!');
    console.log(`  Message ID: ${info.messageId}`);
    console.log(`  Recipient:  ${targetRecipient}`);
    console.log('\nPlease check your Gmail inbox (and spam/promotions folder) now.');
    console.log('===============================================================\n');
  } catch (sendErr) {
    console.error('❌ Failed to dispatch test email:', sendErr.message);
    process.exit(1);
  }
}

testEmailDelivery().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
