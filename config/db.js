// config/db.js

const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(config.db.uri, config.db.options);
    logger.info(`MongoDB connected successfully to ${config.db.uri}`);
  } catch (error) {
    logger.error('MongoDB connection error', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

module.exports = connectDB;

