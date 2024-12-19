// backend/routes/adminAuth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const dotenv = require('dotenv');
dotenv.config();

// POST /auth/admin/register
// Accessible only by existing admins
router.post('/register', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { username, email, password } = req.body;

  // Basic input validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if user/email already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already in use' });
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create and save the admin
    const newAdmin = new User({
      username,
      email,
      password: hashedPassword,
      role: 'admin',
    });

    await newAdmin.save();

    res.status(201).json({ message: 'Admin registered successfully' });
  } catch (error) {
    console.error('Admin registration error:', error.message);
    res.status(500).json({ error: 'Server error during admin registration' });
  }
});

// POST /auth/admin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Basic input validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find the admin by email
    const admin = await User.findOne({ email, role: 'admin' });
    if (!admin) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Create JWT payload
    const payload = {
      id: admin._id,
      username: admin.username,
      role: admin.role,
    };

    // Sign JWT
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ message: 'Admin login successful', token });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(500).json({ error: 'Server error during admin login' });
  }
});

module.exports = router;
