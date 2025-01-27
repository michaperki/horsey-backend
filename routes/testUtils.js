
// backend/routes/testUtils.js

const express = require('express');
const router = express.Router();
const seedAdmin = require('../scripts/seedAdmin');
const mongoose = require('mongoose');
const User = require('../models/User'); // Ensure you have the User model imported
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

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

module.exports = router;

