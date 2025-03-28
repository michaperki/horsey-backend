// backend/routes/adminAuth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ValidationError, ResourceConflictError, AuthenticationError } = require('../utils/errorTypes');
const dotenv = require('dotenv');
dotenv.config();

// POST /auth/admin/register
// Accessible only by existing admins
router.post('/register', authenticateToken, authorizeRole('admin'), asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  // Basic input validation
  if (!username || !email || !password) {
    throw new ValidationError('All fields are required');
  }

  // Check if user/email already exists
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new ResourceConflictError('Username or email already in use');
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
}));

// POST /auth/admin/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Basic input validation
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Find the admin by email
  const admin = await User.findOne({ email, role: 'admin' });
  if (!admin) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Compare passwords
  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    throw new AuthenticationError('Invalid credentials');
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
}));

module.exports = router;
