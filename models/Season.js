// backend/models/Season.js

const mongoose = require('mongoose');

/**
 * Season Schema
 * 
 * Represents a competition period with start and end dates,
 * where users earn points based on their betting performance.
 */
const SeasonSchema = new mongoose.Schema(
  {
    seasonNumber: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed'],
      default: 'upcoming',
    },
    rewards: {
      firstPlace: {
        tokens: { type: Number, default: 1000 },
        sweepstakes: { type: Number, default: 100 },
      },
      secondPlace: {
        tokens: { type: Number, default: 500 },
        sweepstakes: { type: Number, default: 50 },
      },
      thirdPlace: {
        tokens: { type: Number, default: 250 },
        sweepstakes: { type: Number, default: 25 },
      }
    },
    metadata: {
      totalGames: { type: Number, default: 0 },
      totalBets: { type: Number, default: 0 },
      totalTokensWagered: { type: Number, default: 0 },
      totalSweepstakesWagered: { type: Number, default: 0 },
    }
  },
  { timestamps: true }
);

/**
 * Helper method to check if a season is active
 */
SeasonSchema.methods.isActive = function() {
  const now = new Date();
  return now >= this.startDate && now <= this.endDate;
};

/**
 * Helper method to check if a season has ended
 */
SeasonSchema.methods.hasEnded = function() {
  return new Date() > this.endDate;
};

/**
 * Helper method to check if a season has started
 */
SeasonSchema.methods.hasStarted = function() {
  return new Date() >= this.startDate;
};

/**
 * Helper method to get remaining time in the season
 */
SeasonSchema.methods.getRemainingTime = function() {
  const now = new Date();
  if (now > this.endDate) return 0;
  return this.endDate - now;
};

// Create indexes for improved query performance
SeasonSchema.index({ status: 1 });
SeasonSchema.index({ startDate: 1, endDate: 1 });
// The unique index on seasonNumber is already created by the schema definition above
// so we don't need to create it again here

module.exports = mongoose.model('Season', SeasonSchema);
