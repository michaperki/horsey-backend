
// backend/controllers/betController.js

const mongoose = require('mongoose');
const axios = require('axios');
const Bet = require('../models/Bet');
const User = require('../models/User');
const { getGameOutcome, createLichessGame } = require('../services/lichessService');

/**
 * Retrieves the bet history for the authenticated user.
 * Supports pagination and sorting.
 */
const getBetHistory = async (req, res) => {
  const userId = req.user.id;

  console.log("Fetching bet history for:", userId);
  // Existing pagination & sorting
  const { 
    page = 1, 
    limit = 10, 
    sortBy = 'createdAt', 
    order = 'desc',
    status,
    fromDate,
    toDate,
    minWager,
    maxWager,
    color,
    timeControl,
  } = req.query;

  const filter = {
    $or: [{ creatorId: userId }, { opponentId: userId }],
  };

  if (status) {
    filter.status = status; // e.g. { $or: [...], status: 'pending' }
  }
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) {
      filter.createdAt.$gte = new Date(fromDate);
    }
    if (toDate) {
      filter.createdAt.$lte = new Date(toDate);
    }
  }
  if (minWager || maxWager) {
    filter.amount = {};
    if (minWager) {
      filter.amount.$gte = Number(minWager);
    }
    if (maxWager) {
      filter.amount.$lte = Number(maxWager);
    }
  }
  if (color) {
    filter.creatorColor = color; // Or filter by finalWhiteId/finalBlackId if needed
  }
  if (timeControl) {
    filter.timeControl = timeControl;
  }

  const validSortFields = ['createdAt', 'amount', 'gameId', 'status'];
  if (!validSortFields.includes(sortBy)) {
    return res.status(400).json({ 
      error: `Invalid sort field. Valid fields are: ${validSortFields.join(', ')}`,
    });
  }

  const sortOrder = order === 'asc' ? 1 : -1;

  try {
    const bets = await Bet.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10))
      .populate('creatorId', 'username')
      .populate('opponentId', 'username');

    const totalBets = await Bet.countDocuments(filter);
    const totalPages = Math.ceil(totalBets / limit);

    res.json({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
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
    // Fetch all pending bets and populate creatorId with username and balance
    const pendingBets = await Bet.find({ status: 'pending' })
      .populate('creatorId', 'username balance');

    // Map the data to include creatorColor
    const seekers = pendingBets.map((bet) => ({
      id: bet._id,
      creator: bet.creatorId ? bet.creatorId.username : 'Unknown',
      creatorBalance: bet.creatorId ? bet.creatorId.balance : 0,
      wager: bet.amount,
      gameType: 'Standard',
      colorPreference: bet.creatorColor, // Include colorPreference
      createdAt: bet.createdAt,
    }));

    res.json(seekers);
  } catch (error) {
    console.error('Error fetching seekers:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred while fetching seekers.' });
  }
};

/**
 * Places a new bet with an expiration time (e.g., 30 minutes).
 */
const placeBet = async (req, res) => {
  const { colorPreference = 'random', amount, timeControl = '5|3' } = req.body;
  const creatorId = req.user.id;
  console.log("Placing bet as user:", creatorId);

  // Input validation
  if (!['white', 'black', 'random'].includes(colorPreference)) {
    return res.status(400).json({ error: 'colorPreference must be "white", "black", or "random"' });
  }

  if (amount == null || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  try {
    // Fetch user to check balance
    const user = await User.findById(creatorId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has sufficient balance
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient token balance' });
    }

    // Deduct the bet amount from user's balance
    user.balance -= amount;
    await user.save();

    // Define expiration period (30 minutes in this example)
    const EXPIRATION_PERIOD_MS = 30 * 60 * 1000; // 30 minutes
    const expiresAt = new Date(Date.now() + EXPIRATION_PERIOD_MS);

    // Create a new Bet instance with status 'pending' and set expiresAt
    const newBet = new Bet({
      creatorId,
      creatorColor: colorPreference,
      amount,
      timeControl,
      status: 'pending',
      expiresAt, // Auto-expiration timestamp
    });

    // Save the bet to the database
    await newBet.save();

    res.status(201).json({ message: 'Bet placed successfully', bet: newBet });
  } catch (error) {
    console.error('Error placing bet:', error.message);
    res.status(500).json({ error: 'Server error while placing bet' });
  }
};

/**
 * Accepts a pending bet, assigns colors, deducts tokens, creates a Lichess game, and updates the bet.
 */
const acceptBet = async (req, res) => {
  const { betId } = req.params;
  const opponentId = req.user.id;

  // Validate betId
  if (!mongoose.Types.ObjectId.isValid(betId)) {
    return res.status(400).json({ error: 'Invalid bet ID' });
  }

  try {
    // Atomically find and update the bet to ensure concurrency safety
    const bet = await Bet.findOneAndUpdate(
      { _id: betId, status: 'pending', opponentId: null },
      { opponentId, status: 'matched' },
      { new: true }
    ).populate('creatorId');

    if (!bet) {
      return res.status(400).json({ error: 'Bet is no longer available or does not exist' });
    }

    // Prevent self-acceptance
    if (opponentId.toString() === bet.creatorId._id.toString()) {
      await Bet.findByIdAndUpdate(betId, { opponentId: null, status: 'pending' });
      return res.status(400).json({ error: 'You cannot accept your own bet.' });
    }

    // Fetch opponent details
    const opponent = await User.findById(opponentId);

    if (!opponent) {
      await Bet.findByIdAndUpdate(betId, { opponentId: null, status: 'pending' });
      return res.status(404).json({ error: 'Opponent user not found' });
    }

    // Ensure opponent has enough balance
    if (opponent.balance < bet.amount) {
      await Bet.findByIdAndUpdate(betId, { opponentId: null, status: 'pending' });
      return res.status(400).json({ error: 'Insufficient balance to accept this bet' });
    }

    // Deduct the bet amount from opponent's balance
    opponent.balance -= bet.amount;
    await opponent.save();

    // Determine final colors based on creator's color preference
    let finalWhiteId, finalBlackId;

    if (bet.creatorColor === 'random') {
      // Assign colors randomly
      if (Math.random() < 0.5) {
        finalWhiteId = bet.creatorId._id;
        finalBlackId = opponentId;
      } else {
        finalWhiteId = opponentId;
        finalBlackId = bet.creatorId._id;
      }
    } else {
      // Assign colors based on creator's preference
      finalWhiteId = bet.creatorColor === 'white' ? bet.creatorId._id : opponentId;
      finalBlackId = bet.creatorColor === 'black' ? bet.creatorId._id : opponentId;
    }

    // Fetch the user details for assigned colors
    const [whiteUser, blackUser] = await Promise.all([
      User.findById(finalWhiteId),
      User.findById(finalBlackId),
    ]);

    // Check if both users have connected their Lichess accounts
    if (!whiteUser.lichessAccessToken || !blackUser.lichessAccessToken) {
      // Roll back if tokens are missing
      opponent.balance += bet.amount;
      await opponent.save();
      bet.status = 'pending';
      bet.opponentId = null;
      await bet.save();
      return res.status(400).json({ error: 'Both users must connect their Lichess accounts (OAuth token missing).' });
    }

    // Create the Lichess game using the Lichess Controller
    const lichessResponse = await createLichessGame(
      bet.timeControl,
      whiteUser.lichessAccessToken,
      blackUser.lichessAccessToken
    );

    if (!lichessResponse.success) {
      // Roll back if creation fails
      opponent.balance += bet.amount;
      await opponent.save();
      bet.status = 'pending';
      bet.opponentId = null;
      await bet.save();
      return res.status(500).json({ error: 'Failed to create Lichess game', details: lichessResponse.error });
    }

    // Update the Bet record with game details
    bet.finalWhiteId = finalWhiteId;
    bet.finalBlackId = finalBlackId;
    bet.gameId = lichessResponse.gameId; // Store the Lichess game ID
    bet.gameLink = lichessResponse.gameLink; // Store the Lichess game link if available
    bet.status = 'matched';
    await bet.save();

    // Return success response
    return res.json({
      message: 'Bet matched successfully',
      bet,
      gameId: lichessResponse.gameId,
      gameLink: lichessResponse.gameLink,
    });
  } catch (error) {
    console.error('Error accepting bet:', error);
    return res.status(500).json({ error: 'An unexpected error occurred while accepting the bet.' }); // Updated error message
  }
};

const cancelBet = async (req, res) => {
  const { betId } = req.params;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(betId)) {
    return res.status(400).json({ error: 'Invalid bet ID' });
  }

  try {
    // Use findOneAndUpdate to handle concurrency; only update if status = 'pending'
    const bet = await Bet.findOneAndUpdate(
      { _id: betId, creatorId: userId, status: 'pending' },
      { status: 'canceled' },
      { new: true }
    );

    if (!bet) {
      return res.status(400).json({ error: 'Bet not found or not in pending status' });
    }

    // Restore user balance
    const user = await User.findById(userId);
    user.balance += bet.amount;
    await user.save();

    return res.json({ message: 'Bet canceled successfully', bet });
  } catch (error) {
    console.error('Error cancelling bet:', error);
    return res.status(500).json({ error: 'Server error while cancelling bet' });
  }
};

module.exports = { getAvailableSeekers, getBetHistory, placeBet, acceptBet, cancelBet };
