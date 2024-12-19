
// backend/models/Bet.js
const mongoose = require('mongoose');

const BetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    gameId: {
      type: String,
      required: true,
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
      enum: ['pending', 'won', 'lost'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bet', BetSchema);

