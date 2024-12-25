
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
    const bets = await Bet.find({ userId })
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalBets = await Bet.countDocuments({ userId });
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
const getAvailableSeekers = async (req, res) => {
  try {
    // Fetch all pending bets
    const pendingBets = await Bet.find({ status: 'pending' }).populate('userId', 'username balance');

    // Map the data to match the required structure
    const seekers = pendingBets.map((bet) => ({
      id: bet._id,
      creator: bet.userId.username,
      creatorBalance: bet.userId.balance,
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
 */
const getUserBets = async (req, res) => {
  const userId = req.user.id; // Retrieved from auth middleware
  const { status, gameType, page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

  // Build query object based on provided filters
  const query = { userId };

  if (status) {
    query.status = status;
  }

  if (gameType) {
    query.gameType = gameType;
  }

  // Validate sort fields
  const validSortFields = ['createdAt', 'amount', 'gameId', 'status'];
  if (!validSortFields.includes(sortBy)) {
    return res.status(400).json({ error: `Invalid sort field. Valid fields are: ${validSortFields.join(', ')}` });
  }

  const sortOrder = order === 'asc' ? 1 : -1;

  try {
    const bets = await Bet.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalBets = await Bet.countDocuments(query);
    const totalPages = Math.ceil(totalBets / limit);

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      totalBets,
      totalPages,
      bets,
    });
  } catch (error) {
    console.error(`Error fetching bets for user ${userId}:`, error.message);
    res.status(500).json({ error: 'An unexpected error occurred while fetching your bets.' });
  }
};

module.exports = { getAvailableSeekers, getBetHistory, getUserBets };
