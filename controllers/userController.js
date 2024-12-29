
// backend/controllers/userController.js

const User = require('../models/User');

/**
 * Get the authenticated user's profile.
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Ensure authenticateToken middleware sets req.user
    const user = await User.findById(userId).select('-password'); // Exclude sensitive fields

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error.message);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

module.exports = { getUserProfile };
