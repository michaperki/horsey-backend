
// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      default: 1000, // Default starting balance, adjust as needed
    },
    // Add other fields as necessary
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
