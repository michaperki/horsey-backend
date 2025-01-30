// backend/routes/testUtils.js

const express = require('express');
const router = express.Router();
const seedAdmin = require('../scripts/seedAdmin');
const mongoose = require('mongoose');
const User = require('../models/User'); // Ensure you have the User model imported
const Bet = require('../models/Bet'); // Import Bet model
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// Check if the environment is Cypress for testing
const isTestEnv = process.env.NODE_ENV === 'cypress';

// Existing endpoint to reset and seed admin
router.post('/reset-and-seed-admin', async (req, res) => {
  try {
    if (!isTestEnv) {
      // In non-test environments, protect the endpoint
      await authenticateToken(req, res, () => {});
      await authorizeRole('admin')(req, res, () => {});
    }

    // Drop the entire database
    await mongoose.connection.db.dropDatabase();

    // Seed the admin
    await seedAdmin();

    res.status(200).json({ message: 'Database reset and admin seeded successfully.' });
  } catch (error) {
    console.error('Error resetting database and seeding admin:', error);
    res.status(500).json({ error: 'Failed to reset database and seed admin.' });
  }
});

// **New Endpoint to Set Lichess Access Token**
// POST /test/set-lichess-token
router.post('/set-lichess-token', async (req, res) => {
  try {
    if (!isTestEnv) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { email, lichessAccessToken } = req.body;

    if (!email || !lichessAccessToken) {
      return res.status(400).json({ error: 'Email and Lichess Access Token are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.lichessAccessToken = lichessAccessToken;
    await user.save();

    res.status(200).json({ message: 'Lichess access token set successfully.' });
  } catch (error) {
    console.error('Error setting Lichess access token:', error);
    res.status(500).json({ error: 'Failed to set Lichess access token.' });
  }
});

// **New Endpoint to Conclude Game**
// POST /test/conclude-game
router.post('/conclude-game', async (req, res) => {
  try {
    if (!isTestEnv) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { gameId, outcome } = req.body;

    if (!gameId || !['white', 'black', 'draw'].includes(outcome)) {
      return res.status(400).json({ error: 'Invalid gameId or outcome.' });
    }

    // Find the bet by gameId
    const bet = await Bet.findOne({ gameId }).populate('creatorId').populate('opponentId');

    if (!bet) {
      return res.status(404).json({ error: 'Bet not found.' });
    }

    if (bet.status !== 'matched') {
      return res.status(400).json({ error: `Cannot conclude bet with status '${bet.status}'.` });
    }

    // Set the outcome
    bet.status = outcome === 'draw' ? 'draw' : 'won';
    bet.winnerId = outcome === 'white' ? bet.finalWhiteId._id : outcome === 'black' ? bet.finalBlackId._id : null;
    await bet.save();

    // Credit the winner if not a draw
    if (outcome !== 'draw') {
      const winner = outcome === 'white' ? bet.finalWhiteId : bet.finalBlackId;
      winner.tokenBalance += bet.amount * 2; // Assuming pot is twice the bet amount
      await winner.save();
    } else {
      // Refund both players in case of a draw
      bet.creatorId.tokenBalance += bet.amount;
      if (bet.opponentId) {
        bet.opponentId.tokenBalance += bet.amount;
      }
      await bet.creatorId.save();
      if (bet.opponentId) await bet.opponentId.save();
    }

    res.status(200).json({ message: 'Game concluded successfully.', bet });
  } catch (error) {
    console.error('Error concluding game:', error);
    res.status(500).json({ error: 'Failed to conclude game.' });
  }
});

module.exports = router;
