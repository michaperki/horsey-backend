// backend/config/db.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { DatabaseError } = require('../utils/errorTypes');

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

/**
 * Connects to MongoDB with the appropriate configuration
 * @returns {Promise} MongoDB connection
 */
const connectDB = async () => {
  try {
    // Determine which URI to use based on environment
    const uri = process.env.NODE_ENV === 'test' 
      ? process.env.MONGODB_URI_TEST 
      : process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }
    
    // Configure connection options with best practices
    const options = {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true
    };
    
    // Connect to MongoDB
    await mongoose.connect(uri, options);
    
    console.log(`MongoDB connected successfully to ${uri}`);
    
    // Set up connection event handlers
    mongoose.connection.on('error', err => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected successfully');
    });
    
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw new DatabaseError(`Failed to connect to MongoDB: ${error.message}`);
  }
};

module.exports = connectDB;
