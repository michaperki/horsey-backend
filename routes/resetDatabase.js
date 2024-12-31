
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// Models (import all the collections you want to reset)
const User = require('../models/User');
const Bet = require('../models/Bet');
// Add other models as needed

/**
 * @route   POST /reset-database
 * @desc    Resets the database by clearing all collections
 * @access  Protected (Admin only)
 */
router.post('/', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    // Clear the collections
    await Promise.all([
      User.deleteMany({}),
      Bet.deleteMany({}),
      // Add other models here
    ]);

    res.status(200).json({ message: 'Database reset successfully.' });
  } catch (error) {
    console.error('Error resetting database:', error);
    res.status(500).json({ error: 'Failed to reset the database.' });
  }
});

module.exports = router;
