
// backend/controllers/betController.js

const Bet = require('../models/Bet');

/**
 * Retrieves the bet history for the authenticated user.
 * Supports pagination and sorting.
 */
const getBetHistory = async (req, res) => {
  const userId = req.user.id; // Obtained from auth middleware
  const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

  // Validate query parameters
  const validSortFields = ['createdAt', 'amount', 'gameId', 'status'];
  if (!validSortFields.includes(sortBy)) {
    return res.status(400).json({ error: `Invalid sort field. Valid fields are: ${validSortFields.join(', ')}` });
  }

  const sortOrder = order === 'asc' ? 1 : -1;

  try {
    // Fetch bets where the user is either creator or opponent
    const bets = await Bet.find({
      $or: [{ creatorId: userId }, { opponentId: userId }],
    })
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('creatorId', 'username')
      .populate('opponentId', 'username');

    const totalBets = await Bet.countDocuments({
      $or: [{ creatorId: userId }, { opponentId: userId }],
    });
    const totalPages = Math.ceil(totalBets / limit);

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      totalBets,
      totalPages,
      bets,
    });
  } catch (error) {
    console.error(`Error fetching bet history for user ${userId}:`, error.message);
    res.status(500).json({ error: 'An unexpected error occurred while fetching bet history.' });
  }
};

/**
 * Retrieves all available game seekers (pending bets).
 */
// backend/controllers/betController.js

const getAvailableSeekers = async (req, res) => {
  try {
    // Fetch all pending bets and populate creatorId with username and balance
    const pendingBets = await Bet.find({ status: 'pending' })
      .populate('creatorId', 'username balance');

    // Map the data to match the required structure
    const seekers = pendingBets.map((bet) => ({
      id: bet._id,
      creator: bet.creatorId ? bet.creatorId.username : 'Unknown', // Handle undefined creatorId
      creatorBalance: bet.creatorId ? bet.creatorId.balance : 0,  // Handle undefined creatorId
      wager: bet.amount,
      gameType: 'Standard', // Assuming a default game type; adjust as needed
      createdAt: bet.createdAt,
    }));

    res.json(seekers);
  } catch (error) {
    console.error('Error fetching seekers:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred while fetching seekers.' });
  }
};

/**
 * Retrieves all bets for the authenticated user.
 * Can include filters like status, game type, etc., as needed.
 * **This function is removed to eliminate duplication with getBetHistory.**
 */

module.exports = { getAvailableSeekers, getBetHistory };

