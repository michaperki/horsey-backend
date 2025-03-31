// backend/models/SeasonStats.js

const mongoose = require('mongoose');

/**
 * SeasonStats Schema
 * 
 * Tracks user performance statistics within a specific season.
 * Used for calculating leaderboards and season rewards.
 */
const SeasonStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Season',
      required: true,
    },
    // Tokens-based stats
    tokenBalance: {
      type: Number,
      default: 0,
    },
    tokenWins: {
      type: Number,
      default: 0,
    },
    tokenLosses: {
      type: Number,
      default: 0,
    },
    tokenGamesPlayed: {
      type: Number,
      default: 0,
    },
    tokenWagered: {
      type: Number,
      default: 0,
    },
    tokenEarned: {
      type: Number,
      default: 0,
    },
    tokenNetProfit: {
      type: Number,
      default: 0,
    },
    // Sweepstakes-based stats
    sweepstakesBalance: {
      type: Number,
      default: 0,
    },
    sweepstakesWins: {
      type: Number,
      default: 0,
    },
    sweepstakesLosses: {
      type: Number,
      default: 0,
    },
    sweepstakesGamesPlayed: {
      type: Number,
      default: 0,
    },
    sweepstakesWagered: {
      type: Number,
      default: 0,
    },
    sweepstakesEarned: {
      type: Number,
      default: 0,
    },
    sweepstakesNetProfit: {
      type: Number,
      default: 0,
    },
    // Awards and achievements
    rank: {
      type: Number,
      default: null,
    },
    rewards: {
      tokens: {
        type: Number,
        default: 0,
      },
      sweepstakes: {
        type: Number,
        default: 0,
      },
    },
    achievements: [{
      type: String,
      enum: ['first_place', 'second_place', 'third_place', 'most_games', 'highest_win_rate'],
    }],
  },
  { timestamps: true }
);

// Create compound index for user and season combination
SeasonStatsSchema.index({ userId: 1, seasonId: 1 }, { unique: true });

// Create indexes for leaderboard queries
SeasonStatsSchema.index({ seasonId: 1, tokenBalance: -1 });
SeasonStatsSchema.index({ seasonId: 1, sweepstakesBalance: -1 });
SeasonStatsSchema.index({ seasonId: 1, tokenNetProfit: -1 });
SeasonStatsSchema.index({ seasonId: 1, sweepstakesNetProfit: -1 });

module.exports = mongoose.model('SeasonStats', SeasonStatsSchema);
