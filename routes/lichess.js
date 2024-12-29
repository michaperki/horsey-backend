// backend/routes/lichess.js

const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const {
  initiateLichessOAuth,
  handleLichessCallback,
  validateResultHandler,
  getLichessStatus,
  getLichessUser,
} = require('../controllers/lichessController');

// **OAuth Flow Routes**

/**
 * @route   GET /lichess/auth
 * @desc    Initiates Lichess OAuth flow
 * @access  Protected (Authenticated Users)
 */
router.get('/auth', authenticateToken, initiateLichessOAuth);

/**
 * @route   GET /lichess/auth/callback
 * @desc    Handles Lichess OAuth callback
 * @access  Public (Handled via redirect URI)
 */
router.get('/auth/callback', handleLichessCallback);

// Status and User Info
router.get('/status', authenticateToken, getLichessStatus);
router.get('/user', authenticateToken, getLichessUser);

// Define the POST route with the handler
router.post('/validate-result', authenticateToken, authorizeRole('admin'), validateResultHandler);

module.exports = router;
