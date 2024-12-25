
// backend/routes/betRoutes.js

const express = require('express');
const router = express.Router();
const Bet = require('../models/Bet');
const User = require('../models/User'); // Assuming a User model exists
const { authenticateToken } = require('../middleware/authMiddleware');
const { getAvailableSeekers, getBetHistory, getUserBets } = require('../controllers/betController');
const { getGameOutcome } = require('../services/lichessService'); // Import the service

// Helper function to check if a game is valid and open for betting
const isGameOpenForBetting = async (gameId) => {
  const gameOutcome = await getGameOutcome(gameId);

  if (!gameOutcome.success) {
    console.error(`Failed to retrieve game outcome for Game ID ${gameId}:`, gameOutcome.error);
    return false;
  }

  const { status } = gameOutcome;

  // Allow betting for 'created' or 'started' games
  if (!['created', 'started'].includes(status)) {
    return false;
  }

  return true;
};

// POST /bets/place
router.post('/place', authenticateToken, async (req, res) => {
  const { gameId, choice, amount } = req.body;
  const userId = req.user.id; // Assuming `req.user` contains the authenticated user's info

  // Input validation
  if (!gameId || !choice || !amount) {
    return res.status(400).json({ error: 'gameId, choice, and amount are required' });
  }

  if (!['white', 'black'].includes(choice)) {
    return res.status(400).json({ error: 'choice must be either "white" or "black"' });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: 'amount must be greater than 0' });
  }

  try {
    // Fetch user to check balance
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has sufficient balance
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient token balance' });
    }

    // Verify if gameId is valid and open for betting
    const gameIsOpen = await isGameOpenForBetting(gameId);

    if (!gameIsOpen) {
      return res.status(400).json({ error: 'Betting is closed for this game' });
    }

    // Deduct the bet amount from user's balance
    user.balance -= amount;
    await user.save();

    // Create a new Bet instance
    const newBet = new Bet({
      userId,
      gameId,
      choice,
      amount,
    });

    // Save the bet to the database
    await newBet.save();

    res.status(201).json({ message: 'Bet placed successfully', bet: newBet });
  } catch (error) {
    console.error('Error placing bet:', error.message);
    res.status(500).json({ error: 'Server error while placing bet' });
  }
});

module.exports = router;
// POST /bets/accept
router.post('/accept', authenticateToken, async (req, res) => {
  const { seekerId } = req.body; // seekerId corresponds to the Bet._id of the seeker

  if (!seekerId) {
    return res.status(400).json({ error: 'seekerId is required' });
  }

  try {
    // Find the seeker's bet
    const seekerBet = await Bet.findById(seekerId).populate('userId', 'username balance');

    if (!seekerBet) {
      return res.status(404).json({ error: 'Seeker not found' });
    }

    if (seekerBet.status !== 'pending') {
      return res.status(400).json({ error: 'Seeker is no longer available' });
    }

    // Check if the current user has enough balance
    const currentUser = await User.findById(req.user.id);

    if (currentUser.balance < seekerBet.amount) {
      return res.status(400).json({ error: 'Insufficient balance to accept this bet' });
    }

    // Deduct the wager amount from the current user
    currentUser.balance -= seekerBet.amount;
    await currentUser.save();

    // Update the seeker's bet status to 'matched' and link to the current user
    seekerBet.status = 'matched';
    seekerBet.matchedWith = req.user.id;
    await seekerBet.save();

    // Create a new bet for the current user linking to the seeker's gameId
    const newBet = new Bet({
      userId: req.user.id,
      gameId: seekerBet.gameId, // Assuming the same gameId represents the match
      choice: seekerBet.choice, // Align choices; adjust if necessary
      amount: seekerBet.amount,
      status: 'matched',
      matchedWith: seekerBet.userId._id,
    });

    await newBet.save();

    res.json({ message: 'Successfully joined the bet', bet: newBet });
  } catch (error) {
    console.error('Error accepting seeker:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred while accepting the seeker.' });
  }
});

// GET /bets/history
router.get('/history', authenticateToken, getBetHistory);

// GET /bets/seekers
router.get('/seekers', authenticateToken, getAvailableSeekers);

// GET /bets/your-bets
router.get('/your-bets', authenticateToken, getUserBets);

module.exports = router;

