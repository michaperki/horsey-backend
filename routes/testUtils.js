
// backend/routes/testUtils.js

const express = require('express');
const router = express.Router();
const seedAdmin = require('../scripts/seedAdmin');
const mongoose = require('mongoose'); // Import mongoose
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const isTestEnv = process.env.NODE_ENV === 'cypress';

// POST /test/reset-and-seed-admin
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

module.exports = router;

