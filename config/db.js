// Update the db.js file to use the centralized config
// config/db.js

const mongoose = require('mongoose');
const config = require('./index');

const connectDB = async () => {
  try {
    await mongoose.connect(config.db.uri, config.db.options);
    console.log(`MongoDB connected successfully to ${config.db.uri}`);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

