// backend/controllers/userController.js
const User = require('../models/User');
const Bet = require('../models/Bet');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ResourceNotFoundError } = require('../utils/errorTypes');

/**
 * Get the authenticated user's profile along with updated statistics.
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id; // assumed to be a string
  console.log(`Fetching profile for userId: ${userId}`);

  const user = await User.findById(userId).select('-password +lichessAccessToken');
  console.log('User fetched from DB:', user ? user.username : 'Not found');

  if (!user) {
    throw new ResourceNotFoundError('User');
  }

  const currencyType = req.query.currencyType || 'token';

  // Total games using an aggregation with $expr and $toString for proper string matching
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
  console.log(`Total games for ${user.username} (${currencyType}): ${totalGames}`);

  // Valid bets using $expr with $toString
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
  console.log('Valid bets:', validBets);

  // Wins: count bets where the user is the winner
  const wins = await Bet.countDocuments({
    $expr: { $eq: [{ $toString: '$winnerId' }, userId] },
    currencyType,
  });
  console.log(`Wins for ${user.username} (${currencyType}): ${wins}`);

  // Losses: count bets where the user participated but did not win
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
  console.log(`Losses for ${user.username} (${currencyType}): ${losses}`);

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
  console.log(`Total wagered: ${totalWagered}, Average wager: ${averageWager} (${currencyType})`);

  // Total winnings aggregation (using $ifNull in case 'winnings' isn't set)
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
  console.log(`Total winnings for ${user.username} (${currencyType}): ${totalWinnings}`);

  // Total losses aggregation for bets lost by the user
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
  console.log(`Total losses for ${user.username} (${currencyType}): ${totalLosses}`);

  // Calculate ROI
  const averageROI =
    totalWagered > 0 ? (((totalWinnings - totalLosses) / totalWagered) * 100).toFixed(2) : '0.00';
  console.log(`Calculated ROI for ${user.username} (${currencyType}): ${averageROI}%`);

  const { karma, membership, tokenBalance } = user;
  console.log('Sending user profile response');
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
      ratingClass: user.ratingClass, // Include rating class in response
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

  res.json({ notifications: user.notifications || 0 });
});

const getUserBalances = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select('tokenBalance sweepstakesBalance');

  if (!user) {
    throw new ResourceNotFoundError('User');
  }

  res.json({
    tokenBalance: user.tokenBalance,
    sweepstakesBalance: user.sweepstakesBalance,
  });
});

module.exports = { getUserProfile, getUserData, getUserBalances };
