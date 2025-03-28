// backend/routes/resetDatabase.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { DatabaseError } = require('../utils/errorTypes');

// Models (import all the collections you want to reset)
const User = require('../models/User');
const Bet = require('../models/Bet');
// Add other models as needed

/**
 * @route   POST /reset-database
 * @desc    Resets the database by clearing all collections
 * @access  Protected (Admin only)
 */
router.post('/', authenticateToken, authorizeRole('admin'), asyncHandler(async (req, res) => {
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
    throw new DatabaseError(`Failed to reset the database: ${error.message}`);
  }
}));

/**
 * @route   POST /reset-database/collection/:name
 * @desc    Resets a specific collection in the database
 * @access  Protected (Admin only)
 */
router.post('/collection/:name', authenticateToken, authorizeRole('admin'), asyncHandler(async (req, res) => {
  const { name } = req.params;
  
  // Security check - only allow resetting specific collections
  const allowedCollections = ['users', 'bets', 'notifications', 'products', 'purchases'];
  
  if (!allowedCollections.includes(name)) {
    throw new ValidationError(`Collection '${name}' cannot be reset. Allowed collections: ${allowedCollections.join(', ')}`);
  }
  
  try {
    let result;
    
    switch (name) {
      case 'users':
        result = await User.deleteMany({});
        break;
      case 'bets':
        result = await Bet.deleteMany({});
        break;
      // Add other collections as needed
      default:
        throw new ValidationError(`Collection '${name}' is not recognized`);
    }
    
    res.status(200).json({ 
      message: `Collection '${name}' reset successfully.`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error(`Error resetting collection '${name}':`, error);
    throw new DatabaseError(`Failed to reset collection '${name}': ${error.message}`);
  }
}));

module.exports = router;
