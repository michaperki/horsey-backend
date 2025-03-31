// backend/controllers/leaderboardController.js

const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const SeasonStats = require('../models/SeasonStats');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');
const seasonService = require('../services/seasonService');

/**
 * GET /leaderboard
 * Retrieves the leaderboard data, including username, average rating, win percentage, and number of games.
 * Updated to support both all-time and seasonal leaderboards.
 */
const getLeaderboard = asyncHandler(async (req, res) => {
  try {
    const { type = 'all-time', currencyType = 'token', limit = 10, seasonId } = req.query;
    
    logger.info('Fetching leaderboard data', { type, currencyType });
    
    // If seasonal leaderboard requested, delegate to season service
    if (type === 'season') {
      const seasonLeaderboard = await seasonService.getSeasonLeaderboard(
        seasonId, 
        currencyType,
        parseInt(limit, 10)
      );
      
      return res.json(seasonLeaderboard);
    }
    
    // Otherwise, fetch the all-time leaderboard (existing functionality)
    // Define the rating fields to consider
    const ratingFields = ['lichessRatings.bullet', 'lichessRatings.blitz', 'lichessRatings.rapid', 'lichessRatings.classical'];

    // Aggregation pipeline
    const leaderboard = await User.aggregate([
      {
        // Project necessary fields and calculate the average rating
        $project: {
          username: 1,
          averageRating: {
            $avg: [
              '$lichessRatings.bullet',
              '$lichessRatings.blitz',
              '$lichessRatings.rapid',
              '$lichessRatings.classical',
            ],
          },
          tokenBalance: 1,
          sweepstakesBalance: 1
        },
      },
      {
        // Only include users with at least one rating
        $match: {
          averageRating: { $ne: null },
        },
      },
      {
        // Lookup bets where the user is either creator or opponent and the game is completed
        $lookup: {
          from: 'bets',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$status', ['won', 'lost', 'draw']] },
                    {
                      $or: [
                        { $eq: ['$creatorId', '$$userId'] },
                        { $eq: ['$opponentId', '$$userId'] },
                      ],
                    },
                    { $eq: ['$currencyType', currencyType] }
                  ],
                },
              },
            },
            {
              // Project to determine if it's a win for the user
              $project: {
                status: 1,
                isWin: {
                  $cond: [
                    {
                      $or: [
                        { $and: [{ $eq: ['$status', 'won'] }, { $eq: ['$creatorId', '$$userId'] }] },
                        { $and: [{ $eq: ['$status', 'lost'] }, { $eq: ['$opponentId', '$$userId'] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          ],
          as: 'userBets',
        },
      },
      {
        // Add fields for totalGames and wins
        $addFields: {
          totalGames: { $size: '$userBets' },
          wins: { $sum: '$userBets.isWin' },
          balance: currencyType === 'token' ? '$tokenBalance' : '$sweepstakesBalance'
        },
      },
      {
        // Calculate win percentage
        $addFields: {
          winPercentage: {
            $cond: [
              { $gt: ['$totalGames', 0] },
              {
                $round: [{ $multiply: [{ $divide: ['$wins', '$totalGames'] }, 100] }, 2],
              },
              0,
            ],
          },
        },
      },
      {
        // Sort by the requested balance type
        $sort: { balance: -1 },
      },
      {
        // Optionally limit the number of results (e.g., top 100)
        $limit: parseInt(limit, 10),
      },
      {
        // Final projection
        $project: {
          _id: 0,
          username: 1,
          rating: { $round: ['$averageRating', 0] },
          winPercentage: 1,
          games: '$totalGames',
          balance: 1
        },
      },
    ]);

    logger.info('Leaderboard data fetched successfully', { count: leaderboard.length });
    res.json(leaderboard);
  } catch (error) {
    logger.error('Error fetching leaderboard', { error: error.message, stack: error.stack });
    throw new DatabaseError('Failed to fetch leaderboard data');
  }
});

module.exports = { getLeaderboard };
