
// backend/models/User.js

const mongoose = require('mongoose');

/**
 * **StandardRatingsSchema**
 * 
 * Captures standard time control ratings from Lichess.
 */
const StandardRatingsSchema = new mongoose.Schema({
  ultraBullet: { type: Number, default: null },
  bullet: { type: Number, default: null },
  blitz: { type: Number, default: null },
  rapid: { type: Number, default: null },
  classical: { type: Number, default: null },
  correspondence: { type: Number, default: null },
}, { _id: false });

/**
 * **VariantsRatingsSchema**
 * 
 * Captures ratings for various chess variants on Lichess.
 */
const VariantsRatingsSchema = new mongoose.Schema({
  chess960: { type: Number, default: null },
  kingOfTheHill: { type: Number, default: null },
  threeCheck: { type: Number, default: null },
  antichess: { type: Number, default: null },
  atomic: { type: Number, default: null },
  horde: { type: Number, default: null },
  racingKings: { type: Number, default: null },
  crazyhouse: { type: Number, default: null },
  // Add other variants as needed
}, { _id: false });

/**
 * **LichessRatingsSchema**
 * 
 * Nests both StandardRatingsSchema and VariantsRatingsSchema.
 */
const LichessRatingsSchema = new mongoose.Schema({
  standard: {
    type: StandardRatingsSchema,
    default: () => ({}),
  },
  variants: {
    type: VariantsRatingsSchema,
    default: () => ({}),
  }
}, { _id: false });

/**
 * **UserSchema**
 * 
 * Main User schema defining user documents in MongoDB.
 */
const UserSchema = new mongoose.Schema(
  {
    // **Basic User Information**
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
    // **Updated Balance Fields**
    tokenBalance: { // Renamed from 'balance'
      type: Number,
      default: 1000, // Starting token balance for users
    },
    sweepstakesBalance: { // New second balance
      type: Number,
      default: 0,    // Starting sweepstakes balance for users
    },
    karma: { // New field
      type: Number,
      default: 0,
    },
    membership: { // New field
      type: String,
      enum: ['Free', 'Premium'],
      default: 'Free',
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

    // **Lichess Integration Fields**
    lichessId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple documents to have null
    },
    lichessUsername: {
      type: String,
      trim: true,
    },
    lichessAccessToken: {
      type: String,
      select: false, // Prevents the token from being returned in queries by default
    },
    lichessRefreshToken: {
      type: String, // Optional: if Lichess provides refresh tokens
      select: false,
    },
    lichessConnectedAt: {
      type: Date, // Stores the timestamp when the user connected their Lichess account
      default: null,
    },
    lichessRatings: {
      type: LichessRatingsSchema, // Nested schema for standard and variant ratings
      default: () => ({}),
    },
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

/**
 * **Indexes**
 * 
 * - Unique index on lichessId is handled by the field definition (unique: true).
 * - Compound index for email and username to optimize queries.
 */

// Compound index for faster lookup based on email and username
UserSchema.index({ email: 1, username: 1 });

/**
 * **Pre-save Middleware**
 * 
 * Example: Hashing passwords before saving (commented out).
 */
// Uncomment and install bcrypt if you plan to use password hashing
/*
const bcrypt = require('bcrypt');

UserSchema.pre('save', async function(next) {
  const user = this;
  
  if (!user.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(user.password, salt);
    user.password = hash;
    next();
  } catch (err) {
    next(err);
  }
});
*/

/**
 * **Methods**
 * 
 * Example: Method to compare passwords (commented out).
 */
// Example of a method to compare passwords
/*
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
*/

module.exports = mongoose.model('User', UserSchema);

