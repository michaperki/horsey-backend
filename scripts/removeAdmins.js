const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const connectDB = require('../config/db');
const logger = require('../utils/logger');

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

async function removeAdmins() {
  try {
    await connectDB();
    const result = await User.deleteMany({ role: 'admin' });
    logger.info(`Removed ${result.deletedCount} admin user(s) successfully.`);
  } catch (error) {
    logger.error('Error removing admin users', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    mongoose.connection.close();
  }
}

if (require.main === module) {
  removeAdmins()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = removeAdmins;
