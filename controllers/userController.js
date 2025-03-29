// backend/controllers/userController.js
const User = require('../models/User');
const Bet = require('../models/Bet');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ResourceNotFoundError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

/**
 * Get the authenticated user's profile along with updated statistics.
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  logger.info('Fetching profile for user', { userId });

  const user = await User.findById(userId).select('-password +lichessAccessToken');
  logger.info('User fetched from DB', { username: user ? user.username : 'Not found' });

  if (!user) {
    throw new ResourceNotFoundError('User');
  }

  const currencyType = req.query.currencyType || 'token';

  // Total games aggregation
  const totalGamesAgg = await Bet.aggregate([
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $toString: '$creatorId' }, userId] },
            { $eq: [{ $toString: '$opponentId' }, userId] }
          ]
        },
        status: { $in: ['won', 'lost', 'draw'] },
        currencyType,
      },
    },
    { $count: "totalGames" }
  ]);
  const totalGames = totalGamesAgg[0] ? totalGamesAgg[0].totalGames : 0;
  logger.info('Total games calculated', { username: user.username, currencyType, totalGames });

  // Valid bets query
  const validBets = await Bet.find({
    $expr: {
      $or: [
        { $eq: [{ $toString: '$creatorId' }, userId] },
        { $eq: [{ $toString: '$opponentId' }, userId] }
      ]
    },
    status: { $in: ['won', 'lost', 'draw'] },
    currencyType,
  });
  logger.debug('Valid bets retrieved', { username: user.username, count: validBets.length });

  // Wins count
  const wins = await Bet.countDocuments({
    $expr: { $eq: [{ $toString: '$winnerId' }, userId] },
    currencyType,
  });
  logger.info('Wins calculated', { username: user.username, currencyType, wins });

  // Losses count
  const losses = await Bet.countDocuments({
    $expr: {
      $and: [
        {
          $or: [
            { $eq: [{ $toString: '$creatorId' }, userId] },
            { $eq: [{ $toString: '$opponentId' }, userId] }
          ]
        },
        { $ne: [{ $toString: '$winnerId' }, userId] }
      ]
    },
    status: { $in: ['won', 'lost'] },
    currencyType,
  });
  logger.info('Losses calculated', { username: user.username, currencyType, losses });

  // Total wagered and average wager aggregation
  const wagerAgg = await Bet.aggregate([
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $toString: '$creatorId' }, userId] },
            { $eq: [{ $toString: '$opponentId' }, userId] }
          ]
        },
        status: { $in: ['won', 'lost', 'draw'] },
        currencyType,
      },
    },
    {
      $group: {
        _id: null,
        totalWagered: { $sum: '$amount' },
        averageWager: { $avg: '$amount' },
      },
    },
  ]);
  const totalWagered = wagerAgg[0]?.totalWagered || 0;
  const averageWager = wagerAgg[0]?.averageWager || 0;
  logger.info('Wager statistics calculated', { username: user.username, currencyType, totalWagered, averageWager });

  // Total winnings aggregation
  const winningsAgg = await Bet.aggregate([
    {
      $match: {
        $expr: { $eq: [{ $toString: '$winnerId' }, userId] },
        currencyType,
      },
    },
    {
      $group: {
        _id: null,
        totalWinnings: { $sum: { $ifNull: ['$winnings', 0] } },
      },
    },
  ]);
  const totalWinnings = winningsAgg[0]?.totalWinnings || 0;
  logger.info('Total winnings calculated', { username: user.username, currencyType, totalWinnings });

  // Total losses aggregation
  const lossesAgg = await Bet.aggregate([
    {
      $match: {
        $expr: {
          $and: [
            {
              $or: [
                { $eq: [{ $toString: '$creatorId' }, userId] },
                { $eq: [{ $toString: '$opponentId' }, userId] }
              ]
            },
            { $ne: [{ $toString: '$winnerId' }, userId] }
          ]
        },
        status: { $in: ['won', 'lost'] },
        currencyType,
      },
    },
    {
      $group: {
        _id: null,
        totalLosses: { $sum: '$amount' },
      },
    },
  ]);
  const totalLosses = lossesAgg[0]?.totalLosses || 0;
  logger.info('Total losses calculated', { username: user.username, currencyType, totalLosses });

  // Calculate ROI
  const averageROI =
    totalWagered > 0 ? (((totalWinnings - totalLosses) / totalWagered) * 100).toFixed(2) : '0.00';
  logger.info('ROI calculated', { username: user.username, currencyType, averageROI });

  const { karma, membership, tokenBalance } = user;
  logger.info('Sending user profile response', { username: user.username });
  res.json({
    user: {
      username: user.username,
      email: user.email,
      role: user.role,
      balance: tokenBalance,
      karma,
      membership,
      lichessConnected: !!user.lichessConnectedAt,
      lichessUsername: user.lichessUsername,
    },
    statistics: {
      totalGames,
      wins,
      losses,
      averageWager,
      totalWagered,
      averageROI,
      totalWinnings,
      totalLosses,
      karma,
      membership,
      ratingClass: user.ratingClass,
      points: tokenBalance,
    },
  });
});

const getUserData = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select('+lichessAccessToken notifications');

  if (!user) {
    throw new ResourceNotFoundError('User');
  }

  logger.info('User data fetched', { userId, notifications: user.notifications || 0 });
  res.json({ notifications: user.notifications || 0 });
});

const getUserBalances = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select('tokenBalance sweepstakesBalance');

  if (!user) {
    throw new ResourceNotFoundError('User');
  }

  logger.info('User balances retrieved', { userId, tokenBalance: user.tokenBalance, sweepstakesBalance: user.sweepstakesBalance });
  res.json({
    tokenBalance: user.tokenBalance,
    sweepstakesBalance: user.sweepstakesBalance,
  });
});

module.exports = { getUserProfile, getUserData, getUserBalances };

