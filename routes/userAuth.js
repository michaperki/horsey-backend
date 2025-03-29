// backend/routes/userAuth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');
const { authenticateToken } = require('../middleware/authMiddleware');
const { getUserProfile } = require('../controllers/userController');
const { validate, userAuthValidation } = require('../middleware/validationMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ValidationError, ResourceConflictError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

dotenv.config();

// POST /auth/register with validation and proper error handling
router.post('/register', validate(userAuthValidation), asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username) {
    throw new ValidationError('Username is required');
  }

  // Check if user/email already exists
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new ResourceConflictError('Username or email already in use');
  }

  // Hash the password with proper error handling
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create and save the user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    
    logger.info('User registered successfully', { email, username });
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    logger.error('Error hashing password or saving user', { 
      error: error.message, 
      stack: error.stack,
      email
    });
    throw error; // Let the global error handler handle it
  }
}));

// POST /auth/login with validation
router.post('/login', validate(userAuthValidation), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find the user by email
  const user = await User.findOne({ email, role: 'user' });
  if (!user) {
    throw new ValidationError('Invalid credentials');
  }

  // Compare passwords
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ValidationError('Invalid credentials');
  }

  // Create JWT payload
  const payload = {
    id: user._id,
    username: user.username,
    role: user.role,
  };

  // Sign JWT
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ message: 'Login successful', token });
}));

// GET /auth/profile - Protected route
router.get('/profile', authenticateToken, getUserProfile);

module.exports = router;
