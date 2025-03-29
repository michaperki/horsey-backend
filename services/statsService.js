// backend/services/statsService.js
const Bet = require('../models/Bet');
const User = require('../models/User');
const { DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

// In-memory counter for games played today
let gamesPlayedToday = 0;

/**
 * Gets the current platform statistics
 * @param {number} onlineUsers - Number of currently online users
 * @returns {Promise<Object>} Object containing platform statistics
 */
async function getStats(onlineUsers) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Count games played today from the database
    const gamesPlayed = await Bet.countDocuments({
      createdAt: { $gte: startOfDay },
      gameId: { $ne: null }
    });

    // Get additional statistics
    const totalUsers = await User.countDocuments();
    const activeBets = await Bet.countDocuments({ status: 'pending' });

    // Get betting volume in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentBets = await Bet.find({
      createdAt: { $gte: oneDayAgo }
    });

    // Calculate total betting volume
    let tokenVolume = 0;
    let sweepstakesVolume = 0;
    recentBets.forEach(bet => {
      if (bet.currencyType === 'sweepstakes') {
        sweepstakesVolume += bet.amount;
      } else {
        tokenVolume += bet.amount;
      }
    });

    return { 
      onlineUsers, 
      gamesPlayed,
      totalUsers,
      activeBets,
      betting24h: {
        tokenVolume,
        sweepstakesVolume,
        totalBets: recentBets.length
      }
    };
  } catch (error) {
    logger.error('Error fetching platform statistics', { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to fetch platform statistics: ${error.message}`);
  }
}

/**
 * Increments the in-memory counter for games played today
 */
function incrementGames() {
  gamesPlayedToday++;
  logger.info('Incremented games played today', { gamesPlayedToday });
}

/**
 * Resets the daily games counter
 */
function resetDailyGames() {
  gamesPlayedToday = 0;
  logger.info('Reset daily games counter');
}

/**
 * Gets user-specific statistics
 * @param {string} userId - User ID to get stats for
 * @param {string} [currencyType='token'] - Currency type to filter by
 * @returns {Promise<Object>} User statistics
 */
async function getUserStats(userId, currencyType = 'token') {
  try {
    // Verify the user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new DatabaseError('User not found');
    }

    // Calculate various statistics from bets
    const totalBets = await Bet.countDocuments({
      $or: [{ creatorId: userId }, { opponentId: userId }],
      currencyType
    });

    // Count wins
    const wins = await Bet.countDocuments({
      winnerId: userId,
      currencyType
    });

    // Completed games (won, lost, or draw status)
    const completedGames = await Bet.countDocuments({
      $or: [{ creatorId: userId }, { opponentId: userId }],
      status: { $in: ['won', 'lost', 'draw'] },
      currencyType
    });

    // Calculate win rate
    const winRate = completedGames > 0 ? (wins / completedGames) * 100 : 0;

    // Sum up total amount bet
    const bets = await Bet.find({
      $or: [{ creatorId: userId }, { opponentId: userId }],
      currencyType
    });

    let totalWagered = 0;
    let totalWon = 0;
    bets.forEach(bet => {
      // Add to wagered amount
      if (
        (bet.creatorId.toString() === userId && ['matched', 'won', 'lost', 'draw'].includes(bet.status)) ||
        (bet.opponentId && bet.opponentId.toString() === userId)
      ) {
        totalWagered += bet.amount;
      }

      // Add to won amount
      if (bet.winnerId && bet.winnerId.toString() === userId) {
        totalWon += bet.winnings || bet.amount * 2;
      }
    });

    return {
      totalBets,
      wins,
      losses: completedGames - wins,
      winRate: parseFloat(winRate.toFixed(2)),
      totalWagered,
      totalWon,
      netProfit: totalWon - totalWagered,
      roi: totalWagered > 0 ? parseFloat(((totalWon - totalWagered) / totalWagered * 100).toFixed(2)) : 0
    };
  } catch (error) {
    logger.error(`Error fetching statistics for user ${userId}`, { error: error.message, stack: error.stack });
    if (error.isOperational) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch user statistics: ${error.message}`);
  }
}

module.exports = { 
  getStats, 
  incrementGames, 
  resetDailyGames,
  getUserStats
};
