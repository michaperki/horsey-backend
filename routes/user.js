
// backend/routes/user.js

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getUserData, getUserBalances } = require('../controllers/userController');

/**
 * @route   GET /user/data
 * @desc    Get authenticated user's data (e.g., notifications)
 * @access  Protected
 */
router.get('/data', authenticateToken, getUserData);

/**
 * @route   GET /user/balances
 * @desc    Get authenticated user's token and sweepstakes balances
 * @access  Protected
 */
router.get('/balances', authenticateToken, getUserBalances);

module.exports = router;

