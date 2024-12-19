
// backend/testConnection.js
require('dotenv').config();
const mongoose = require('mongoose');

const testConnection = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connection successful');
    mongoose.connection.close();
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  }
};

testConnection();
