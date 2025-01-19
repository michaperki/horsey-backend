
// backend/models/Bet.js
const mongoose = require('mongoose');

const BetSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    opponentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    creatorColor: {
      type: String,
      enum: ['white', 'black', 'random'],
      required: true,
    },
    opponentColor: {
      type: String,
      enum: ['white', 'black', 'random'],
      default: null,
    },
    finalWhiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    finalBlackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    gameId: {
      type: String,
      default: null, // Make gameId optional
      index: true,
    },
    gameLink: {
      type: String,
      default: null
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Bet amount must be at least 1'],
    },
    status: {
      type: String,
      enum: ['pending', 'matched', 'won', 'lost', 'canceled', 'expired'], 
      default: 'pending',
      index: true,
    },
    timeControl: {
      type: String,
      default: '5|3', // Default time control, adjust as needed
    },
    // Add an optional field to track when the bet expires
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient querying
BetSchema.index({ creatorId: 1, createdAt: -1 });
BetSchema.index({ opponentId: 1, createdAt: -1 });
BetSchema.index({ status: 1, createdAt: -1 });
BetSchema.index({ amount: 1 });  // For min/max wager queries
BetSchema.index({ expiresAt: 1 });  // For auto-expiration checks

module.exports = mongoose.model('Bet', BetSchema);
