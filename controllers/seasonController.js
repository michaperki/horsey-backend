// backend/controllers/seasonController.js

const Season = require('../models/Season');
const SeasonStats = require('../models/SeasonStats');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ValidationError, ResourceNotFoundError } = require('../utils/errorTypes');
const seasonService = require('../services/seasonService');
const logger = require('../utils/logger');

/**
 * Get active season information
 * @route GET /api/seasons/active
 * @access Public
 */
const getActiveSeason = asyncHandler(async (req, res) => {
  const activeSeason = await seasonService.getActiveSeason();
  
  if (!activeSeason) {
    throw new ResourceNotFoundError('No active season found');
  }
  
  // Calculate time remaining
  const now = new Date();
  const timeRemaining = activeSeason.endDate - now;
  const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  res.json({
    season: {
      id: activeSeason._id,
      seasonNumber: activeSeason.seasonNumber,
      name: activeSeason.name,
      startDate: activeSeason.startDate,
      endDate: activeSeason.endDate,
      status: activeSeason.status,
      timeRemaining: {
        total: timeRemaining,
        days: daysRemaining,
        hours: hoursRemaining
      }
    },
    rewards: activeSeason.rewards,
    metadata: activeSeason.metadata
  });
});

/**
 * Get season leaderboard
 * @route GET /api/seasons/leaderboard
 * @access Public
 */
const getSeasonLeaderboard = asyncHandler(async (req, res) => {
  const { 
    seasonId, 
    currencyType = 'token', 
    limit = 10 
  } = req.query;
  
  // Validate inputs
  if (currencyType !== 'token' && currencyType !== 'sweepstakes') {
    throw new ValidationError('Currency type must be either "token" or "sweepstakes"');
  }
  
  // Get active season if none specified
  let targetSeasonId = seasonId;
  if (!targetSeasonId) {
    const activeSeason = await seasonService.getActiveSeason();
    if (!activeSeason) {
      throw new ResourceNotFoundError('No active season found');
    }
    targetSeasonId = activeSeason._id;
  }
  
  const leaderboard = await seasonService.getSeasonLeaderboard(
    targetSeasonId,
    currencyType,
    parseInt(limit, 10)
  );
  
  res.json({ leaderboard });
});

/**
 * Get the current user's season stats
 * @route GET /api/seasons/mystats
 * @access Private
 */
const getUserSeasonStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { seasonId } = req.query;
  
  const stats = await seasonService.getUserSeasonStats(userId, seasonId);
  
  if (!stats) {
    throw new ResourceNotFoundError('Season stats not found for the current user');
  }
  
  res.json(stats);
});

/**
 * Get all seasons
 * @route GET /api/seasons
 * @access Public
 */
const getAllSeasons = asyncHandler(async (req, res) => {
  const seasons = await Season.find()
    .sort({ seasonNumber: -1 })
    .select('seasonNumber name startDate endDate status metadata');
  
  res.json({ seasons });
});

/**
 * Create a new season (admin only)
 * @route POST /api/seasons
 * @access Private (Admin only)
 */
const createSeason = asyncHandler(async (req, res) => {
  const { 
    name, 
    startDate, 
    endDate, 
    rewards 
  } = req.body;
  
  // Validate inputs
  if (!startDate || !endDate) {
    throw new ValidationError('Start date and end date are required');
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ValidationError('Invalid date format');
  }
  
  if (end <= start) {
    throw new ValidationError('End date must be after start date');
  }
  
  const newSeason = await seasonService.createSeason({
    name,
    startDate: start,
    endDate: end,
    rewards: rewards || undefined
  });
  
  res.status(201).json({
    message: 'Season created successfully',
    season: {
      id: newSeason._id,
      seasonNumber: newSeason.seasonNumber,
      name: newSeason.name,
      startDate: newSeason.startDate,
      endDate: newSeason.endDate,
      status: newSeason.status
    }
  });
});

/**
 * Trigger season transitions manually (admin only)
 * @route POST /api/seasons/process-transitions
 * @access Private (Admin only)
 */
const triggerSeasonTransitions = asyncHandler(async (req, res) => {
  await seasonService.processSeasonTransitions();
  
  res.json({
    message: 'Season transitions processed successfully'
  });
});

module.exports = {
  getActiveSeason,
  getSeasonLeaderboard,
  getUserSeasonStats,
  getAllSeasons,
  createSeason,
  triggerSeasonTransitions
};
