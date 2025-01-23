
// backend/controllers/userController.js

const User = require('../models/User');
const Bet = require('../models/Bet'); // Assuming Bet model holds game data

/**
 * Get the authenticated user's profile along with updated statistics.
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Ensure authenticateToken middleware sets req.user
    const user = await User.findById(userId).select('-password +lichessAccessToken');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Aggregate user statistics
    const totalGames = await Bet.countDocuments({
      $or: [{ creatorId: userId }, { opponentId: userId }],
      status: { $in: ['won', 'lost', 'draw'] }, // Only completed games
    });

    const wins = await Bet.countDocuments({ creatorId: userId, status: 'won' }) +
                 await Bet.countDocuments({ opponentId: userId, status: 'won' });

    const losses = await Bet.countDocuments({ creatorId: userId, status: 'lost' }) +
                   await Bet.countDocuments({ opponentId: userId, status: 'lost' });

    // Total Wagered
    const totalWageredData = await Bet.aggregate([
      {
        $match: {
          $or: [{ creatorId: userId }, { opponentId: userId }],
          status: { $in: ['won', 'lost', 'draw'] },
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

    const totalWagered = totalWageredData[0]?.totalWagered || 0;
    const averageWager = totalWageredData[0]?.averageWager || 0;

    // Total Winnings and Losses
    const totalWinningsData = await Bet.aggregate([
      {
        $match: {
          $or: [{ creatorId: userId, status: 'won' }, { opponentId: userId, status: 'won' }],
        },
      },
      {
        $group: {
          _id: null,
          totalWinnings: { $sum: '$winnings' }, // Assuming 'winnings' field exists
        },
      },
    ]);

    const totalWinnings = totalWinningsData[0]?.totalWinnings || 0;

    const totalLossesData = await Bet.aggregate([
      {
        $match: {
          $or: [{ creatorId: userId, status: 'lost' }, { opponentId: userId, status: 'lost' }],
        },
      },
      {
        $group: {
          _id: null,
          totalLosses: { $sum: '$amount' }, // Assuming 'amount' represents the loss
        },
      },
    ]);

    const totalLosses = totalLossesData[0]?.totalLosses || 0;

    // Calculate ROI
    const averageROI = totalWagered > 0 ? ((totalWinnings - totalLosses) / totalWagered * 100).toFixed(2) : '0.00';

    // Assuming 'karma' and 'membership' are fields in User model
    const { karma, membership, balance } = user;

    res.json({
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        balance,
        karma,
        membership,
        lichessConnected: !!user.lichessConnectedAt,
        lichessUsername: user.lichessUsername,
        // Add other necessary fields
      },
      statistics: {
        totalGames,
        averageWager,
        totalWagered,
        averageROI,
        totalWinnings,
        totalLosses,
        karma,
        membership,
        points: balance, // Assuming 'balance' represents points
      },
    });
  } catch (error) {
    console.error('Error fetching user profile:', error.message);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

/**
 * Get authenticated user's data, including notifications.
 */
const getUserData = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming authenticateToken sets req.user
    const user = await User.findById(userId).select('+lichessAccessToken notifications');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ notifications: user.notifications || 0 });
  } catch (error) {
    console.error('Error fetching user data:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getUserProfile, getUserData };

