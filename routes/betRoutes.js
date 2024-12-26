
// backend/routes/betRoutes.js

const express = require('express');
const router = express.Router();
const Bet = require('../models/Bet');
const User = require('../models/User'); // Assuming a User model exists
const { authenticateToken } = require('../middleware/authMiddleware');
const { getAvailableSeekers, getBetHistory } = require('../controllers/betController');
const { getGameOutcome } = require('../services/lichessService'); // Import the service
const mongoose = require('mongoose');

const isGameOpenForBetting = async (gameId) => {
  try {
    const gameResult = await getGameOutcome(gameId);
    if (!gameResult.success) {
      throw new Error(gameResult.error);
    }
    // Define your criteria for betting to be open.
    // For example, betting is open if the game status is 'created' or 'started'.
    return ['created', 'started'].includes(gameResult.status);
  } catch (error) {
    console.error(`Error in isGameOpenForBetting for Game ID ${gameId}:`, error.message);
    throw error; // Propagate the error to be handled by the route
  }
};

// POST /bets/place
router.post('/place', authenticateToken, async (req, res) => {
  const { gameId, creatorColor, amount } = req.body;
  const creatorId = req.user.id; // Assuming `req.user` contains the authenticated user's info

  // Input validation
  if (!gameId || !creatorColor || !amount) {
    return res.status(400).json({ error: 'gameId, creatorColor, and amount are required' });
  }

  if (!['white', 'black', 'random'].includes(creatorColor)) {
    return res.status(400).json({ error: 'creatorColor must be "white", "black", or "random"' });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: 'amount must be greater than 0' });
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

    // Verify if gameId is valid and open for betting
    const gameIsOpen = await isGameOpenForBetting(gameId);

    if (!gameIsOpen) {
      return res.status(400).json({ error: 'Betting is closed for this game' });
    }

    // Deduct the bet amount from user's balance
    user.balance -= amount;
    await user.save();

    // Create a new Bet instance with status 'pending'
    const newBet = new Bet({
      creatorId,
      creatorColor,
      gameId,
      amount,
      status: 'pending',
    });

    // Save the bet to the database
    await newBet.save();

    res.status(201).json({ message: 'Bet placed successfully', bet: newBet });
  } catch (error) {
    console.error('Error placing bet:', error.message);
    res.status(500).json({ error: 'Server error while placing bet' });
  }
});

// POST /bets/accept/:betId
router.post('/accept/:betId', authenticateToken, async (req, res) => {
  const { betId } = req.params;
  const { opponentColor } = req.body; // Optional: acceptor can specify their color preference
  const opponentId = req.user.id;

  // Validate betId
  if (!mongoose.Types.ObjectId.isValid(betId)) {
    return res.status(400).json({ error: 'Invalid bet ID' });
  }

  try {
    // Atomic operation to find and update the bet if it's still pending
    const bet = await Bet.findOneAndUpdate(
      { _id: betId, status: 'pending', opponentId: null },
      { opponentId, opponentColor: opponentColor || null },
      { new: true }
    ).populate('creatorId', 'username balance');

    if (!bet) {
      return res.status(400).json({ error: 'Bet is no longer available or does not exist' });
    }

    // Check if opponent has enough balance
    const opponent = await User.findById(opponentId);
    if (!opponent) {
      // Revert the opponentId and opponentColor
      bet.opponentId = null;
      bet.opponentColor = null;
      bet.status = 'pending';
      await bet.save();
      return res.status(404).json({ error: 'Opponent user not found' });
    }

    if (opponent.balance < bet.amount) {
      // Revert the opponentId and opponentColor
      bet.opponentId = null;
      bet.opponentColor = null;
      bet.status = 'pending';
      await bet.save();
      return res.status(400).json({ error: 'Insufficient balance to accept this bet' });
    }

    // Deduct the bet amount from opponent's balance
    opponent.balance -= bet.amount;
    await opponent.save();

    // Determine final color assignments
    let finalWhiteId, finalBlackId;

    if (bet.creatorColor !== 'random' && opponentColor && opponentColor !== 'random') {
      if (bet.creatorColor === opponentColor) {
        // Both chose the same color, randomly assign
        if (Math.random() < 0.5) {
          finalWhiteId = bet.creatorId._id;
          finalBlackId = opponentId;
        } else {
          finalWhiteId = opponentId;
          finalBlackId = bet.creatorId._id;
        }
      } else {
        // Assign based on preferences
        finalWhiteId = bet.creatorColor === 'white' ? bet.creatorId._id : opponentId;
        finalBlackId = bet.creatorColor === 'black' ? bet.creatorId._id : opponentId;
      }
    } else {
      // At least one user chose 'random', assign randomly
      if (Math.random() < 0.5) {
        finalWhiteId = bet.creatorId._id;
        finalBlackId = opponentId;
      } else {
        finalWhiteId = opponentId;
        finalBlackId = bet.creatorId._id;
      }
    }

    // Update the bet with final color assignments and status
    bet.finalWhiteId = finalWhiteId;
    bet.finalBlackId = finalBlackId;
    bet.status = 'matched';

    await bet.save();

    res.json({ message: 'Bet matched successfully', bet });
  } catch (error) {
    console.error('Error accepting bet:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred while accepting the bet.' });
  }
});
// GET /bets/history
router.get('/history', authenticateToken, getBetHistory);

// GET /bets/seekers
router.get('/seekers', authenticateToken, getAvailableSeekers);

module.exports = router;

