const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');

async function setPrimaryAdmin() {
  const targetAdminEmail = (process.env.PRIMARY_ADMIN_GOOGLE_EMAIL || 'sahaaniruddha2004@gmail.com').trim().toLowerCase();

  console.log(`Setting sole administrator privileges for: [${targetAdminEmail}]...`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB database.');

  // 1. Demote any other accounts with role: 'admin'
  const demoteRes = await User.updateMany(
    { email: { $ne: targetAdminEmail }, role: 'admin' },
    { $set: { role: 'student', permissions: [] } }
  );
  console.log(`Demoted other admin accounts count: ${demoteRes.modifiedCount}`);

  // 2. Upsert targetAdminEmail
  let adminUser = await User.findOne({ email: targetAdminEmail });
  if (adminUser) {
    adminUser.role = 'admin';
    adminUser.status = 'approved';
    adminUser.isProfileComplete = true;
    await adminUser.save();
    console.log(`✓ Existing user updated to Administrator: ${targetAdminEmail}`);
  } else {
    adminUser = await User.create({
      name: 'Aniruddha Saha',
      email: targetAdminEmail,
      role: 'admin',
      status: 'approved',
      isProfileComplete: true,
      university: 'Administrator',
      degreeProgram: 'Depository Administration',
      researchDomain: 'Computer Science & Security',
      permissions: [],
    });
    console.log(`✓ New Administrator user provisioned: ${targetAdminEmail}`);
  }

  // 3. Confirm all admins in database
  const allAdmins = await User.find({ role: 'admin' }, 'name email role status googleId');
  console.log('\nAuthoritative List of All Administrators in Database:');
  console.log(JSON.stringify(allAdmins, null, 2));

  await mongoose.disconnect();
  console.log('\nDone. Database disconnected.');
}

setPrimaryAdmin().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
