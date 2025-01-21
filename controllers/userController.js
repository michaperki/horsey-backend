
// backend/controllers/userController.js

const User = require('../models/User');
const Bet = require('../models/Bet'); // Assuming Bet model holds game data

/**
 * Get the authenticated user's profile along with statistics.
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Ensure authenticateToken middleware sets req.user
    const user = await User.findById(userId).select('-password'); // Exclude sensitive fields

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

    const winPercentage = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(2) : '0.00';

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
        wins,
        losses,
        winPercentage,
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
    const user = await User.findById(userId).select('notifications'); // Adjust fields as needed

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

