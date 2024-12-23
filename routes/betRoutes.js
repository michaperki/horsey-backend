
// backend/routes/betRoutes.js
const express = require('express');
const router = express.Router();
const Bet = require('../models/Bet');
const User = require('../models/User'); // Assuming a User model exists
const { authenticateToken } = require('../middleware/authMiddleware');
const axios = require('axios'); // To verify gameId with Lichess API
const { getBetHistory } = require('../controllers/betController');

// Helper function to check if a game is valid and open for betting
const isGameOpenForBetting = async (gameId) => {
  try {
    const url = `https://lichess.org/game/export/${gameId}?pgnInJson=true`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const gameData = response.data;

    console.log(gameData.status);

    // Allow betting for 'created' or 'started' games
    if (gameData.status !== 'created' && gameData.status !== 'started') {
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error verifying gameId ${gameId}:`, error.message);
    return false;
  }
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

// GET /bets/history
router.get('/history', authenticateToken, getBetHistory);

module.exports = router;

