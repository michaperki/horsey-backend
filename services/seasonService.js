// backend/services/seasonService.js

const mongoose = require('mongoose');
const Season = require('../models/Season');
const SeasonStats = require('../models/SeasonStats');
const User = require('../models/User');
const Bet = require('../models/Bet');
const { sendNotification } = require('./notificationService');
const { DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

/**
 * Creates a new season with the specified parameters
 * @param {Object} seasonData - Data for the new season
 * @returns {Promise<Object>} - The created season
 */
const createSeason = async (seasonData) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Get the current highest season number
    const highestSeason = await Season.findOne()
      .sort({ seasonNumber: -1 })
      .limit(1)
      .session(session);

    const newSeasonNumber = highestSeason ? highestSeason.seasonNumber + 1 : 1;

    // Create new season with auto-incrementing season number
    const newSeason = new Season({
      ...seasonData,
      seasonNumber: newSeasonNumber,
      name: seasonData.name || `Season ${newSeasonNumber}`,
    });

    await newSeason.save({ session });

    // Auto-activate season if start date is now or in the past
    if (new Date() >= newSeason.startDate && newSeason.status !== 'active') {
      newSeason.status = 'active';
      await newSeason.save({ session });

      // Initialize season stats for all users
      await initializeSeasonStatsForAllUsers(newSeason._id, session);
    }

    await session.commitTransaction();
    logger.info(`Created new season: ${newSeason.name}`, { seasonId: newSeason._id });
    return newSeason;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating season', { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to create season: ${error.message}`);
  } finally {
    session.endSession();
  }
};

/**
 * Initializes season stats for all users
 * @param {ObjectId} seasonId - The ID of the season
 * @param {mongoose.ClientSession} session - Mongoose session for transaction
 */
const initializeSeasonStatsForAllUsers = async (seasonId, session) => {
  try {
    const users = await User.find({}, '_id').session(session);
    
    const seasonStatsDocuments = users.map(user => ({
      userId: user._id,
      seasonId,
      tokenBalance: 0,
      sweepstakesBalance: 0,
    }));

    if (seasonStatsDocuments.length > 0) {
      await SeasonStats.insertMany(seasonStatsDocuments, { session });
    }
    
    logger.info(`Initialized season stats for ${users.length} users`, { seasonId });
  } catch (error) {
    logger.error('Error initializing season stats', { 
      error: error.message, 
      stack: error.stack, 
      seasonId 
    });
    throw error;
  }
};

/**
 * Retrieves the current active season
 * @returns {Promise<Object|null>} - The active season or null if none
 */
const getActiveSeason = async () => {
  try {
    const now = new Date();
    
    // First, try to find a season marked as active
    let activeSeason = await Season.findOne({ status: 'active' });
    
    if (!activeSeason) {
      // If no explicitly active season, find one that should be active based on dates
      activeSeason = await Season.findOne({
        startDate: { $lte: now },
        endDate: { $gte: now }
      });
      
      // Automatically update the status if needed
      if (activeSeason && activeSeason.status !== 'active') {
        activeSeason.status = 'active';
        await activeSeason.save();
      }
    }
    
    return activeSeason;
  } catch (error) {
    logger.error('Error getting active season', { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to get active season: ${error.message}`);
  }
};

/**
 * Updates season stats when a bet is placed
 * @param {Object} bet - The bet object
 * @param {Object} user - The user placing the bet
 */
const updateSeasonStatsOnBetPlaced = async (bet, user) => {
  try {
    const activeSeason = await getActiveSeason();
    if (!activeSeason) return; // No active season
    
    const field = bet.currencyType === 'token' ? 'tokenWagered' : 'sweepstakesWagered';
    const amount = bet.amount;
    
    // Update user's season stats
    await SeasonStats.findOneAndUpdate(
      { userId: user._id, seasonId: activeSeason._id },
      { $inc: { [field]: amount } },
      { upsert: true, new: true }
    );
    
    // Update season metadata
    await Season.findByIdAndUpdate(
      activeSeason._id,
      { 
        $inc: { 
          [`metadata.totalBets`]: 1,
          [`metadata.total${bet.currencyType === 'token' ? 'Tokens' : 'Sweepstakes'}Wagered`]: amount
        } 
      }
    );
    
    logger.info(`Updated season stats for bet placed`, { 
      userId: user._id, 
      betId: bet._id, 
      seasonId: activeSeason._id,
      currencyType: bet.currencyType,
      amount
    });
  } catch (error) {
    logger.error('Error updating season stats on bet placed', { 
      error: error.message, 
      stack: error.stack,
      betId: bet._id,
      userId: user._id
    });
    // Don't throw - we don't want to fail the bet due to season tracking issues
  }
};

/**
 * Updates season stats when a bet is concluded
 * @param {Object} bet - The concluded bet
 * @param {Object} winner - The winning user
 * @param {Object} loser - The losing user
 */
const updateSeasonStatsOnBetConcluded = async (bet, winner, loser) => {
  try {
    const activeSeason = await getActiveSeason();
    if (!activeSeason) return; // No active season
    
    const currencyType = bet.currencyType;
    const winningAmount = bet.winnings || bet.amount * 2;
    const prefix = currencyType === 'token' ? 'token' : 'sweepstakes';
    
    // Update winner's stats
    await SeasonStats.findOneAndUpdate(
      { userId: winner._id, seasonId: activeSeason._id },
      { 
        $inc: { 
          [`${prefix}Wins`]: 1,
          [`${prefix}GamesPlayed`]: 1,
          [`${prefix}Earned`]: winningAmount,
          [`${prefix}NetProfit`]: bet.amount, // They win their bet back plus opponent's
          [`${prefix}Balance`]: bet.amount // Net change to balance (already got winnings added)
        } 
      },
      { upsert: true, new: true }
    );
    
    // Update loser's stats
    await SeasonStats.findOneAndUpdate(
      { userId: loser._id, seasonId: activeSeason._id },
      { 
        $inc: { 
          [`${prefix}Losses`]: 1,
          [`${prefix}GamesPlayed`]: 1,
          [`${prefix}NetProfit`]: -bet.amount,
          [`${prefix}Balance`]: -bet.amount
        } 
      },
      { upsert: true, new: true }
    );
    
    // Update season metadata
    await Season.findByIdAndUpdate(
      activeSeason._id,
      { $inc: { [`metadata.totalGames`]: 1 } }
    );
    
    logger.info(`Updated season stats for concluded bet`, { 
      betId: bet._id, 
      seasonId: activeSeason._id,
      winnerId: winner._id,
      loserId: loser._id,
      currencyType
    });
  } catch (error) {
    logger.error('Error updating season stats on bet concluded', { 
      error: error.message, 
      stack: error.stack, 
      betId: bet._id,
      winnerUserId: winner._id,
      loserUserId: loser._id
    });
    // Don't throw - we don't want to fail the bet due to season tracking issues
  }
};

/**
 * Updates season stats for a draw
 * @param {Object} bet - The concluded bet with draw result
 * @param {Array<Object>} players - The players involved in the draw
 */
const updateSeasonStatsOnDraw = async (bet, players) => {
  try {
    const activeSeason = await getActiveSeason();
    if (!activeSeason) return; // No active season
    
    const currencyType = bet.currencyType;
    const prefix = currencyType === 'token' ? 'token' : 'sweepstakes';
    
    // Update stats for all players
    for (const player of players) {
      await SeasonStats.findOneAndUpdate(
        { userId: player._id, seasonId: activeSeason._id },
        { 
          $inc: { 
            [`${prefix}GamesPlayed`]: 1
            // No change to balance on draw, tokens are returned
          } 
        },
        { upsert: true, new: true }
      );
    }
    
    // Update season metadata
    await Season.findByIdAndUpdate(
      activeSeason._id,
      { $inc: { [`metadata.totalGames`]: 1 } }
    );
    
    logger.info(`Updated season stats for draw bet`, { 
      betId: bet._id, 
      seasonId: activeSeason._id,
      currencyType,
      playerCount: players.length
    });
  } catch (error) {
    logger.error('Error updating season stats on draw', { 
      error: error.message, 
      stack: error.stack, 
      betId: bet._id
    });
    // Don't throw - we don't want to fail the bet due to season tracking issues
  }
};

/**
 * Gets the season leaderboard
 * @param {String} seasonId - Season ID (defaults to active season)
 * @param {String} currencyType - 'token' or 'sweepstakes'
 * @param {Number} limit - Maximum number of entries to return
 * @returns {Promise<Array>} - Leaderboard entries
 */
const getSeasonLeaderboard = async (seasonId = null, currencyType = 'token', limit = 10) => {
  try {
    // If no season ID provided, use active season
    if (!seasonId) {
      const activeSeason = await getActiveSeason();
      if (!activeSeason) {
        return [];
      }
      seasonId = activeSeason._id;
    }
    
    const sortField = currencyType === 'token' ? 'tokenBalance' : 'sweepstakesBalance';
    
    // Aggregation pipeline to get leaderboard
    const leaderboard = await SeasonStats.aggregate([
      { $match: { seasonId: mongoose.Types.ObjectId(seasonId) } },
      { $sort: { [sortField]: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: 1,
          username: '$user.username',
          balance: `$${sortField}`,
          gamesPlayed: `$${currencyType === 'token' ? 'tokenGamesPlayed' : 'sweepstakesGamesPlayed'}`,
          wins: `$${currencyType === 'token' ? 'tokenWins' : 'sweepstakesWins'}`,
          losses: `$${currencyType === 'token' ? 'tokenLosses' : 'sweepstakesLosses'}`,
          netProfit: `$${currencyType === 'token' ? 'tokenNetProfit' : 'sweepstakesNetProfit'}`
        }
      }
    ]);
    
    return leaderboard;
  } catch (error) {
    logger.error('Error getting season leaderboard', { 
      error: error.message, 
      stack: error.stack,
      seasonId,
      currencyType 
    });
    throw new DatabaseError(`Failed to get season leaderboard: ${error.message}`);
  }
};

/**
 * Checks and processes seasons that need to be ended or started
 */
const processSeasonTransitions = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const now = new Date();
    
    // Find seasons that should be marked as completed
    const endingSeasons = await Season.find({
      status: 'active',
      endDate: { $lte: now }
    }).session(session);
    
    for (const season of endingSeasons) {
      // Process end of season rewards
      await distributeSeasonRewards(season._id, session);
      
      // Mark season as completed
      season.status = 'completed';
      await season.save({ session });
      
      logger.info(`Season ${season.name} marked as completed`, { 
        seasonId: season._id, 
        seasonNumber: season.seasonNumber
      });
    }
    
    // Find seasons that should be marked as active
    const startingSeasons = await Season.find({
      status: 'upcoming',
      startDate: { $lte: now },
      endDate: { $gt: now }
    }).session(session);
    
    for (const season of startingSeasons) {
      // Initialize season stats for all users
      await initializeSeasonStatsForAllUsers(season._id, session);
      
      // Mark season as active
      season.status = 'active';
      await season.save({ session });
      
      logger.info(`Season ${season.name} marked as active`, { 
        seasonId: season._id, 
        seasonNumber: season.seasonNumber
      });
    }
    
    // If current active season is ending and no new one is starting, create a new one
    if (endingSeasons.length > 0 && startingSeasons.length === 0) {
      const lastSeason = endingSeasons[0];
      
      // Calculate dates for new season (7 days by default)
      const newStartDate = new Date();
      const newEndDate = new Date(newStartDate);
      newEndDate.setDate(newEndDate.getDate() + 7);
      
      // Create new season
      const newSeason = new Season({
        seasonNumber: lastSeason.seasonNumber + 1,
        name: `Season ${lastSeason.seasonNumber + 1}`,
        startDate: newStartDate,
        endDate: newEndDate,
        status: 'active',
        rewards: lastSeason.rewards // Copy rewards structure from previous season
      });
      
      await newSeason.save({ session });
      
      // Initialize stats for all users
      await initializeSeasonStatsForAllUsers(newSeason._id, session);
      
      logger.info(`Created new season automatically: ${newSeason.name}`, { 
        seasonId: newSeason._id, 
        seasonNumber: newSeason.seasonNumber
      });
    }
    
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error processing season transitions', { 
      error: error.message, 
      stack: error.stack 
    });
    throw new DatabaseError(`Failed to process season transitions: ${error.message}`);
  } finally {
    session.endSession();
  }
};

/**
 * Distributes rewards to top players at the end of a season
 * @param {String} seasonId - ID of the season
 * @param {mongoose.ClientSession} session - Mongoose session for transaction
 */
const distributeSeasonRewards = async (seasonId, session) => {
  try {
    const season = await Season.findById(seasonId).session(session);
    if (!season) {
      throw new Error(`Season ${seasonId} not found`);
    }
    
    // Get top players for tokens
    const topTokenPlayers = await SeasonStats.find({ seasonId })
      .sort({ tokenBalance: -1 })
      .limit(3)
      .session(session);
      
    // Get top players for sweepstakes
    const topSweepstakesPlayers = await SeasonStats.find({ seasonId })
      .sort({ sweepstakesBalance: -1 })
      .limit(3)
      .session(session);
    
    // Distribute token rewards
    await distributeRewardsForCategory(
      topTokenPlayers, 
      season, 
      'tokens', 
      'token',
      session
    );
    
    // Distribute sweepstakes rewards
    await distributeRewardsForCategory(
      topSweepstakesPlayers, 
      season, 
      'sweepstakes',
      'sweepstakes',
      session
    );
    
    logger.info(`Distributed season rewards for season ${season.name}`, { 
      seasonId: season._id,
      tokenWinners: topTokenPlayers.length,
      sweepstakesWinners: topSweepstakesPlayers.length
    });
  } catch (error) {
    logger.error('Error distributing season rewards', { 
      error: error.message, 
      stack: error.stack,
      seasonId
    });
    throw error;
  }
};

/**
 * Helper to distribute rewards for a specific category (tokens or sweepstakes)
 */
const distributeRewardsForCategory = async (topPlayers, season, rewardType, balanceType, session) => {
  const positions = ['firstPlace', 'secondPlace', 'thirdPlace'];
  const achievements = ['first_place', 'second_place', 'third_place'];
  
  for (let i = 0; i < Math.min(topPlayers.length, 3); i++) {
    if (!topPlayers[i]) continue;
    
    const player = topPlayers[i];
    const position = positions[i];
    const achievement = achievements[i];
    const reward = season.rewards[position][rewardType];
    
    // Skip players with no balance
    if (balanceType === 'token' && player.tokenBalance <= 0) continue;
    if (balanceType === 'sweepstakes' && player.sweepstakesBalance <= 0) continue;
    
    // Update player's season stats
    player.rank = i + 1;
    player.rewards[rewardType] = reward;
    if (!player.achievements.includes(achievement)) {
      player.achievements.push(achievement);
    }
    await player.save({ session });
    
    // Update user balance
    const user = await User.findById(player.userId).session(session);
    if (user) {
      const balanceField = balanceType === 'token' ? 'tokenBalance' : 'sweepstakesBalance';
      user[balanceField] += reward;
      await user.save({ session });
      
      // Send notification
      try {
        await sendNotification(
          user._id,
          `Congratulations! You placed #${i+1} in Season ${season.seasonNumber} ${rewardType} leaderboard and earned ${reward} ${rewardType}!`,
          'seasonReward'
        );
      } catch (notifError) {
        logger.warn('Failed to send season reward notification', {
          userId: user._id,
          seasonId: season._id,
          error: notifError.message
        });
      }
    }
  }
};

/**
 * Gets a user's season stats
 * @param {String} userId - User ID
 * @param {String} seasonId - Season ID (defaults to active season)
 * @returns {Promise<Object>} - User's season stats
 */
const getUserSeasonStats = async (userId, seasonId = null) => {
  try {
    // If no season ID provided, use active season
    if (!seasonId) {
      const activeSeason = await getActiveSeason();
      if (!activeSeason) {
        return null;
      }
      seasonId = activeSeason._id;
    }
    
    // Get user's season stats
    const seasonStats = await SeasonStats.findOne({ userId, seasonId });
    if (!seasonStats) {
      return null;
    }
    
    // Get season details
    const season = await Season.findById(seasonId);
    
    // Get user's position on leaderboards
    const tokenRank = await SeasonStats.countDocuments({
      seasonId,
      tokenBalance: { $gt: seasonStats.tokenBalance }
    }) + 1;
    
    const sweepstakesRank = await SeasonStats.countDocuments({
      seasonId,
      sweepstakesBalance: { $gt: seasonStats.sweepstakesBalance }
    }) + 1;
    
    return {
      season: {
        id: season._id,
        seasonNumber: season.seasonNumber,
        name: season.name,
        startDate: season.startDate,
        endDate: season.endDate,
        status: season.status,
        remainingTime: season.getRemainingTime(),
      },
      stats: {
        tokens: {
          balance: seasonStats.tokenBalance,
          wins: seasonStats.tokenWins,
          losses: seasonStats.tokenLosses,
          gamesPlayed: seasonStats.tokenGamesPlayed,
          wagered: seasonStats.tokenWagered,
          earned: seasonStats.tokenEarned,
          netProfit: seasonStats.tokenNetProfit,
          rank: tokenRank,
        },
        sweepstakes: {
          balance: seasonStats.sweepstakesBalance,
          wins: seasonStats.sweepstakesWins,
          losses: seasonStats.sweepstakesLosses,
          gamesPlayed: seasonStats.sweepstakesGamesPlayed,
          wagered: seasonStats.sweepstakesWagered,
          earned: seasonStats.sweepstakesEarned,
          netProfit: seasonStats.sweepstakesNetProfit,
          rank: sweepstakesRank,
        },
        rewards: seasonStats.rewards,
        achievements: seasonStats.achievements,
      }
    };
  } catch (error) {
    logger.error('Error getting user season stats', { 
      error: error.message, 
      stack: error.stack,
      userId,
      seasonId 
    });
    throw new DatabaseError(`Failed to get user season stats: ${error.message}`);
  }
};

/**
 * Creates the initial season if none exists
 */
const createInitialSeasonIfNeeded = async () => {
  try {
    // Check if any seasons exist
    const count = await Season.countDocuments();
    if (count > 0) {
      return;
    }
    
    // Create initial season
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // One week season by default
    
    const newSeason = new Season({
      seasonNumber: 1,
      name: 'Season 1',
      startDate,
      endDate,
      status: 'active',
      rewards: {
        firstPlace: {
          tokens: 1000,
          sweepstakes: 100,
        },
        secondPlace: {
          tokens: 500,
          sweepstakes: 50,
        },
        thirdPlace: {
          tokens: 250,
          sweepstakes: 25,
        }
      }
    });
    
    await newSeason.save();
    
    // Initialize stats for all users
    await initializeSeasonStatsForAllUsers(newSeason._id);
    
    logger.info(`Created initial season: ${newSeason.name}`, { 
      seasonId: newSeason._id, 
      seasonNumber: newSeason.seasonNumber
    });
    
    return newSeason;
  } catch (error) {
    logger.error('Error creating initial season', { 
      error: error.message, 
      stack: error.stack 
    });
    throw new DatabaseError(`Failed to create initial season: ${error.message}`);
  }
};

module.exports = {
  createSeason,
  getActiveSeason,
  updateSeasonStatsOnBetPlaced,
  updateSeasonStatsOnBetConcluded,
  updateSeasonStatsOnDraw,
  getSeasonLeaderboard,
  processSeasonTransitions,
  distributeSeasonRewards,
  getUserSeasonStats,
  createInitialSeasonIfNeeded
};
