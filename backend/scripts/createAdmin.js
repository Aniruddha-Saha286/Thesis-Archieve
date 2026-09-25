#!/usr/bin/env node
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const User = require('../models/User');

const FORBIDDEN_PASSWORDS = new Set([
  'admin',
  'admin123',
  'admin1234',
  'admin12345',
  'admin@1234',
  'admin1234!',
  'thesisadminpass2026!',
  'password',
  'password123',
  'changeme',
]);

function validateAdminPassword(pw) {
  if (!pw || typeof pw !== 'string') {
    return 'Password is required.';
  }
  if (pw.length < 12) {
    return 'Administrator password must be at least 12 characters long.';
  }
  if (FORBIDDEN_PASSWORDS.has(pw.toLowerCase().trim())) {
    return 'Password cannot be a known default, bootstrap, or easily guessable sequence.';
  }
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);

  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    return 'Administrator password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.';
  }
  return null;
}

async function createAdmin() {
  const args = process.argv.slice(2);
  const email = (args[0] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (args[1] || process.env.ADMIN_PASSWORD || '').trim();
  const name = (args[2] || process.env.ADMIN_NAME || 'Editorial Board Administrator').trim();

  if (!process.env.MONGODB_URI) {
    console.error('✗ Fatal Error: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  if (!email || !password) {
    console.log(`
Usage:
  node scripts/createAdmin.js <email> <password> [name]

Or set environment variables:
  ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME

Requirements:
  - Minimum 12 characters
  - Mixed case (uppercase + lowercase)
  - At least one numeric digit
  - At least one special symbol
  - Must NOT be any known bootstrap default
    `);
    process.exit(1);
  }

  const validationError = validateAdminPassword(password);
  if (validationError) {
    console.error(`✗ Password Policy Violation: ${validationError}`);
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database.');

    const hashedPassword = await bcrypt.hash(password, 12);
    let user = await User.findOne({ email });

    if (user) {
      user.name = name;
      user.password = hashedPassword;
      user.role = 'admin';
      user.status = 'approved';
      user.isProfileComplete = true;
      user.verifiedAt = new Date();
      await user.save();
      console.log(`✓ Admin user [${email}] successfully updated with cryptographically verified credentials.`);
    } else {
      user = await User.create({
        name,
        email,
        password: hashedPassword,
        role: 'admin',
        status: 'approved',
        isProfileComplete: true,
        university: 'Archive Editorial Board',
        degreeProgram: 'Administrative Council',
        researchDomain: 'Editorial Board',
        verifiedAt: new Date(),
      });
      console.log(`✓ Admin user [${email}] successfully provisioned with cryptographically verified credentials.`);
    }

    await mongoose.disconnect();
    console.log('Administrator provisioning completed safely.');
    process.exit(0);
  } catch (err) {
    console.error('✗ Failed to provision administrator:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  createAdmin();
}

module.exports = { validateAdminPassword };
