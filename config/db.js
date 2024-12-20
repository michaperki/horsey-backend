
// backend/config/db.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

const connectDB = async () => {
  try {
    const uri = process.env.NODE_ENV === 'test' ? process.env.MONGODB_URI_TEST : process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log(`MongoDB connected successfully to ${uri}`);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

