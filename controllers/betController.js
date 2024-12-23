
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

module.exports = { getBetHistory };
