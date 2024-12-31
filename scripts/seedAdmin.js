
// backend/scripts/seedAdmin.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const connectDB = require('../config/db');

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'cypress' ? '.env.cypress' : '.env' });

async function seedAdmin() {
  try {
    // Check if any admin exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin already exists. Skipping seeding.');
      return;
    }

    // Ensure required environment variables are set
    const { INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD } = process.env;

    if (!INITIAL_ADMIN_USERNAME || !INITIAL_ADMIN_EMAIL || !INITIAL_ADMIN_PASSWORD) {
      console.error('Missing initial admin environment variables. Please set INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD.');
      throw new Error('Missing initial admin environment variables.');
    }

    // Hash the initial admin password
    const hashedPassword = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 10);
    console.log('Hashed Admin Password:', hashedPassword);

    console.log(INITIAL_ADMIN_PASSWORD)
    console.log(INITIAL_ADMIN_USERNAME)

    // Create the initial admin user
    const newAdmin = new User({
      username: INITIAL_ADMIN_USERNAME,
      email: INITIAL_ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
    });

    await newAdmin.save();
    console.log('Initial admin user seeded successfully.');
  } catch (error) {
    console.error('Error seeding admin user:', error);
    throw error;
  }
}

// Execute the seedAdmin function if this script is run directly
if (require.main === module) {
  seedAdmin().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = seedAdmin;
