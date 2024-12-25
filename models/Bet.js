
// backend/models/Bet.js
const mongoose = require('mongoose');

const BetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    gameId: {
      type: String,
      required: true,
      index: true,
    },
    choice: {
      type: String,
      enum: ['white', 'black'],
      required: true,
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
    matchedWith: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for userId and createdAt to optimize sorting and filtering
BetSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Bet', BetSchema);

