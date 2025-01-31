
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
      default: null,
      index: true,
    },
    gameLink: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Bet amount must be at least 1'],
    },
    currencyType: {
      type: String,
      enum: ['token', 'sweepstakes'],
      default: 'token',
    },
    status: {
      type: String,
      enum: ['pending', 'matched', 'won', 'lost', 'canceled', 'expired', 'draw'],
      default: 'pending',
      index: true,
    },
    timeControl: {
      type: String,
      default: '5|3',
    },
    ratingClass: { type: String, default: null },
      variant: {
        type: String,
        enum: ['standard', 'crazyhouse', 'chess960'],
        default: 'standard',
      },
    expiresAt: {
      type: Date,
      default: null,
    },
    // **Add the winnerId field**
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    winnings: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes for efficient querying
BetSchema.index({ creatorId: 1, createdAt: -1 });
BetSchema.index({ opponentId: 1, createdAt: -1 });
BetSchema.index({ status: 1, createdAt: -1 });
BetSchema.index({ amount: 1 });
BetSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Bet', BetSchema);

