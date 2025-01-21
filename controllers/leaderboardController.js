
// backend/controllers/leaderboardController.js

const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');

/**
 * GET /leaderboard
 * Retrieves the leaderboard data, including username, average rating, win percentage, and number of games.
 */
const getLeaderboard = async (req, res) => {
  try {
    // Define the rating fields to consider
    const ratingFields = ['lichessRatings.bullet', 'lichessRatings.blitz', 'lichessRatings.rapid', 'lichessRatings.classical'];

    // Aggregation pipeline
    const leaderboard = await User.aggregate([
      {
        // Project necessary fields and calculate the average rating
        $project: {
          username: 1,
          // Calculate average rating from available rating types
          averageRating: {
            $avg: [
              '$lichessRatings.bullet',
              '$lichessRatings.blitz',
              '$lichessRatings.rapid',
              '$lichessRatings.classical',
            ],
          },
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
        // Sort by averageRating descending
        $sort: { averageRating: -1 },
      },
      {
        // Optionally limit the number of results (e.g., top 100)
        $limit: 100,
      },
      {
        // Final projection
        $project: {
          _id: 0,
          username: 1,
          rating: { $round: ['$averageRating', 0] },
          winPercentage: 1,
          games: '$totalGames',
        },
      },
    ]);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
};

module.exports = { getLeaderboard };
