
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
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Bet amount must be at least 1'],
    },
    status: {
      type: String,
      enum: ['pending', 'matched', 'won', 'lost'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for creatorId and createdAt to optimize sorting and filtering
BetSchema.index({ creatorId: 1, createdAt: -1 });

module.exports = mongoose.model('Bet', BetSchema);

