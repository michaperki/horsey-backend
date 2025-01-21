
// backend/routes/leaderboardRoutes.js

const express = require('express');
const router = express.Router();
const { getLeaderboard } = require('../controllers/leaderboardController');
const { authenticateToken } = require('../middleware/authMiddleware'); // Ensure this middleware exists

// GET /leaderboard
router.get('/', authenticateToken, getLeaderboard);

module.exports = router;

