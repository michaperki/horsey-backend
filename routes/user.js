
// backend/routes/user.js

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getUserData } = require('../controllers/userController');

/**
 * @route   GET /user/data
 * @desc    Get authenticated user's data (e.g., notifications)
 * @access  Protected
 */
router.get('/data', authenticateToken, getUserData);

module.exports = router;
