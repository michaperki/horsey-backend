
// scripts/seedAdmin.js
const bcrypt = require('bcrypt');
const User = require('../models/User');
const logger = require('../utils/logger');

async function seedAdmin() {
  try {
    // Check if any admin exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      logger.info('Admin already exists. Skipping seeding.');
      return;
    }

    // Ensure required environment variables are set
    const { INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD } = process.env;
    if (!INITIAL_ADMIN_USERNAME || !INITIAL_ADMIN_EMAIL || !INITIAL_ADMIN_PASSWORD) {
      logger.error('Missing initial admin environment variables. Please set INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD.');
      throw new Error('Missing initial admin environment variables.');
    }

    // Hash the initial admin password
    const hashedPassword = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 10);
    logger.info('Hashed Admin Password', { hashedPassword });

    // Create the initial admin user
    const newAdmin = new User({
      username: INITIAL_ADMIN_USERNAME,
      email: INITIAL_ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
    });

    await newAdmin.save();
    logger.info('Initial admin user seeded successfully.');
  } catch (error) {
    logger.error('Error seeding admin user', { error: error.message, stack: error.stack });
    throw error;
  }
}

module.exports = seedAdmin;

