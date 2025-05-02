// routes/game.js
const express = require('express');
const router = express.Router();
const chessController = require('../controllers/chessController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { betLimiter } = require('../middleware/rateLimitMiddleware');

// Create a new game
router.post('/start', authenticateToken, chessController.startGame);

// Make a move
router.post('/:gameId/move', authenticateToken, chessController.makeMove);

// Get game state
router.get('/:gameId/state', chessController.getState);

// Resign a game
router.post('/:gameId/resign', authenticateToken, chessController.resignGame);

// Offer a draw
router.post('/:gameId/offer-draw', authenticateToken, chessController.offerDraw);

// Respond to a draw offer
router.post('/:gameId/respond-draw', authenticateToken, chessController.respondToDraw);

// Get recent games
router.get('/recent', chessController.getRecentGames);

// Get user's games
router.get('/user/:userId', authenticateToken, chessController.getUserGames);

module.exports = router;
