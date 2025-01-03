// backend/models/User.js

const mongoose = require('mongoose');

const LichessRatingsSchema = new mongoose.Schema({
  bullet: { type: Number, default: null },
  blitz: { type: Number, default: null },
  rapid: { type: Number, default: null },
  classical: { type: Number, default: null },
  // Add other rating types as needed
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true, // Required for both users and admins
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    balance: {
      type: Number,
      default: 1000, // Starting balance for users
    },
    notificationPreferences: {
      email: {
        type: Boolean,
        default: true,
      },
      inApp: {
        type: Boolean,
        default: true,
      },
    },
    // **New Lichess Fields**
    lichessId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple documents to have null
    },
    lichessUsername: {
      type: String,
    },
    lichessAccessToken: {
      type: String,
    },
    lichessRefreshToken: {
      type: String, // Optional: if Lichess provides refresh tokens
    },
    lichessConnectedAt: {
      type: Date, // New field to store connection timestamp
      default: null,
    },
    lichessRatings: {
      type: LichessRatingsSchema, // New field to store ratings
      default: {}, // Initialize as empty object
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
