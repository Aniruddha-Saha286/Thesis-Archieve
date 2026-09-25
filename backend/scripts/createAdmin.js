#!/usr/bin/env node
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const User = require('../models/User');

async function createAdmin() {
  const args = process.argv.slice(2);
  const email = (args[0] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (args[1] || process.env.ADMIN_PASSWORD || '').trim();
  const name = (args[2] || process.env.ADMIN_NAME || 'Repository Administrator').trim();

  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  if (!email || !password) {
    console.log(`
Usage:
  node scripts/createAdmin.js <email> <password> [name]

Or set environment variables:
  ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME

Requirements:
  Password must be at least 10 characters long.
    `);
    process.exit(1);
  }

  if (password.length < 10) {
    console.error('Error: Administrator password must be at least 10 characters long.');
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
      console.log(`✓ Admin user [${email}] successfully updated with administrator privileges.`);
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
      console.log(`✓ Admin user [${email}] successfully created with administrator privileges.`);
    }

    await mongoose.disconnect();
    console.log('Admin provisioning completed safely.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to provision administrator:', err.message);
    process.exit(1);
  }
}

createAdmin();
