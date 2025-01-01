
// backend/routes/betRoutes.js

const express = require('express');
const router = express.Router();
const Bet = require('../models/Bet');
const User = require('../models/User'); // Assuming a User model exists
const { authenticateToken } = require('../middleware/authMiddleware');
const { getAvailableSeekers, getBetHistory, placeBet, acceptBet, cancelBet } = require('../controllers/betController');
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
router.post('/place', authenticateToken, placeBet);

// POST /bets/accept/:betId
router.post('/accept/:betId', authenticateToken, acceptBet);

// GET /bets/history
router.get('/history', authenticateToken, getBetHistory);

// GET /bets/seekers
router.get('/seekers', authenticateToken, getAvailableSeekers);

// POST /bets/cancel/:betId
router.post('/cancel/:betId', authenticateToken, cancelBet);

module.exports = router;

