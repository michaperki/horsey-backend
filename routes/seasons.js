// backend/routes/seasons.js

const express = require('express');
const { 
  getActiveSeason,
  getSeasonLeaderboard,
  getUserSeasonStats,
  getAllSeasons,
  createSeason,
  triggerSeasonTransitions
} = require('../controllers/seasonController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const router = express.Router();

// Public routes
router.get('/active', getActiveSeason);
router.get('/leaderboard', getSeasonLeaderboard);
router.get('/', getAllSeasons);

// Protected routes (requires authentication)
router.get('/mystats', authenticateToken, getUserSeasonStats);

// Admin-only routes
router.post('/', authenticateToken, authorizeRole('admin'), createSeason);
router.post('/process-transitions', authenticateToken, authorizeRole('admin'), triggerSeasonTransitions);

module.exports = router;
