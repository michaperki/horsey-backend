
// models/game.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Schema = mongoose.Schema;

// Use UUID strings as primary keys instead of ObjectIds
const GameSchema = new Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  players: {
    white: {
      type: Schema.Types.Mixed,
      required: true
    },
    black: {
      type: Schema.Types.Mixed,
      required: true
    }
  },
  fen: {
    type: String,
    default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  },
  pgn: {
    type: String,
    default: ''
  },
  moves: {
    type: Array,
    default: []
  },
  timeControl: {
    type: Number,
    default: 10 // minutes
  },
  increment: {
    type: Number,
    default: 0 // seconds
  },
  whiteTime: {
    type: Number,
    default: 600 // seconds
  },
  blackTime: {
    type: Number,
    default: 600
  },
  status: {
    type: String,
    enum: ['pending', 'ongoing', 'finished', 'aborted'],
    default: 'pending'
  },
  outcome: {
    type: String,
    enum: ['white', 'black', 'draw', ''],
    default: ''
  },
  resultReason: {
    type: String,
    enum: ['checkmate', 'resignation', 'timeout', 'agreement', 'stalemate', 'repetition', 'insufficient', ''],
    default: ''
  },
  resignedBy: {
    type: String,
    enum: ['w', 'b', ''],
    default: ''
  },
  timeoutBy: {
    type: String,
    enum: ['w', 'b', ''],
    default: ''
  },
  drawAgreement: {
    type: Boolean,
    default: false
  },
  rated: {
    type: Boolean,
    default: true
  },
  betId: {
    type: String,
    ref: 'Bet',
    default: null
  }
}, { timestamps: true });

// Indexes for efficient querying
GameSchema.index({ 'players.white': 1, status: 1 });
GameSchema.index({ 'players.black': 1, status: 1 });
GameSchema.index({ status: 1, createdAt: -1 });
GameSchema.index({ betId: 1 });

module.exports = mongoose.models.Game || mongoose.model('Game', GameSchema);

