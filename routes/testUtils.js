// backend/routes/testUtils.js

const express = require('express');
const router = express.Router();
const seedAdmin = require('../scripts/seedAdmin');
const mongoose = require('mongoose');
const User = require('../models/User'); // Ensure you have the User model imported
const Bet = require('../models/Bet'); // Import Bet model
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ValidationError, ResourceNotFoundError, DatabaseError } = require('../utils/errorTypes');

// Check if the environment is Cypress for testing
const isTestEnv = process.env.NODE_ENV === 'cypress';

// Existing endpoint to reset and seed admin
router.post('/reset-and-seed-admin', asyncHandler(async (req, res) => {
  if (!isTestEnv) {
    // In non-test environments, protect the endpoint
    await authenticateToken(req, res, () => {});
    await authorizeRole('admin')(req, res, () => {});
  }

  try {
    // Drop the entire database
    await mongoose.connection.db.dropDatabase();
    
    // Seed the admin
    await seedAdmin();
    
    res.status(200).json({ message: 'Database reset and admin seeded successfully.' });
  } catch (error) {
    console.error('Error resetting database and seeding admin:', error);
    throw new DatabaseError(`Failed to reset database and seed admin: ${error.message}`);
  }
}));

// **New Endpoint to Set Lichess Access Token**
// POST /test/set-lichess-token
router.post('/set-lichess-token', asyncHandler(async (req, res) => {
  if (!isTestEnv) {
    throw new ValidationError('This endpoint is only available in test environment');
  }

  const { email, lichessAccessToken } = req.body;

  if (!email || !lichessAccessToken) {
    throw new ValidationError('Email and Lichess Access Token are required');
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ResourceNotFoundError('User');
  }

  user.lichessAccessToken = lichessAccessToken;
  await user.save();

  res.status(200).json({ message: 'Lichess access token set successfully.' });
}));

// POST /test/conclude-game
router.post('/conclude-game', asyncHandler(async (req, res) => {
  console.log('concluding game for testing purposes');
  
  if (!isTestEnv) {
    throw new ValidationError('This endpoint is only available in test environment');
  }

  const { gameId, outcome } = req.body;

  if (!gameId) {
    throw new ValidationError('Game ID is required');
  }
  
  if (!['white', 'black', 'draw'].includes(outcome)) {
    throw new ValidationError('Outcome must be one of: white, black, draw');
  }

  // Find the bet by gameId
  const bet = await Bet.findOne({ gameId }).populate('creatorId').populate('opponentId');

  if (!bet) {
    throw new ResourceNotFoundError('Bet');
  }

  if (bet.status !== 'matched') {
    throw new ValidationError(`Cannot conclude bet with status '${bet.status}'`);
  }

  // Set outcome and update winnings
  if (outcome === 'draw') {
    bet.status = 'draw';
    bet.winnerId = null;
    bet.winnings = 0;
  } else {
    bet.status = 'won';
    bet.winnerId = outcome === 'white' ? bet.finalWhiteId : bet.finalBlackId;
    bet.winnings = bet.amount * 2;
  }
  await bet.save();

  if (outcome !== 'draw') {
    const winnerId = outcome === 'white' ? bet.finalWhiteId : bet.finalBlackId;
    const winnerUser = await User.findById(winnerId);
    if (!winnerUser) {
      throw new ResourceNotFoundError('Winner user');
    }
    
    // Credit using winnings field
    winnerUser.tokenBalance += bet.winnings;
    await winnerUser.save();
  } else {
    // Refund both players for a draw
    if (!bet.creatorId) {
      throw new ResourceNotFoundError('Creator user');
    }
    
    bet.creatorId.tokenBalance += bet.amount;
    
    if (bet.opponentId) {
      bet.opponentId.tokenBalance += bet.amount;
      await bet.opponentId.save();
    }
    
    await bet.creatorId.save();
  }

  res.status(200).json({ message: 'Game concluded successfully.', bet });
}));

// GET /test/users
router.get('/users', asyncHandler(async (req, res) => {
  if (!isTestEnv) {
    throw new ValidationError('This endpoint is only available in test environment');
  }
  
  const users = await User.find({}, 'username email tokenBalance sweepstakesBalance role');
  res.json({ users });
}));

// POST /test/create-user
router.post('/create-user', asyncHandler(async (req, res) => {
  if (!isTestEnv) {
    throw new ValidationError('This endpoint is only available in test environment');
  }
  
  const { username, email, password, role = 'user' } = req.body;
  
  if (!username || !email || !password) {
    throw new ValidationError('Username, email, and password are required');
  }
  
  // Check if user already exists
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new ValidationError('User with this email or username already exists');
  }
  
  // Create test user with plain text password for testing
  const user = new User({
    username,
    email,
    password,
    role,
    tokenBalance: 5000,
    sweepstakesBalance: 100
  });
  
  await user.save();
  
  res.status(201).json({
    message: 'Test user created successfully',
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role
    }
  });
}));

module.exports = router;
