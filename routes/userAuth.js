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
  
  logger.info('Registration attempt', { email, username });

  try {
    if (!username) {
      throw new ValidationError('Username is required');
    }

    // Check if user/email already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      logger.warn('Registration failed: user exists', { email, username });
      throw new ResourceConflictError('Username or email already in use');
    }

    // Hash the password
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
    return res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    logger.error('Registration error', { email, username, error: error.message, stack: error.stack });
    
    // Handle specific errors
    if (error.name === 'ValidationError') {
      throw new ValidationError(error.message);
    }
    
    // If it's already our custom error, just rethrow it
    if (error.isOperational) {
      throw error;
    }
    
    // Otherwise, wrap it in an appropriate error
    throw new InternalServerError('User registration service error');
  }
}));

// POST /auth/login with validation
router.post('/login', validate(userAuthValidation), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  logger.info('Login attempt', { email });

  try {
    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      logger.warn('Login failed: user not found', { email });
      throw new ValidationError('Invalid credentials');
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn('Login failed: password mismatch', { email });
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
    logger.info('Login successful', { userId: user._id, username: user.username });
    
    return res.json({ message: 'Login successful', token });
  } catch (error) {
    logger.error('Login error', { email, error: error.message, stack: error.stack });
    
    // Handle specific errors
    if (error.name === 'ValidationError') {
      throw new ValidationError(error.message);
    }
    
    // If it's already our custom error, just rethrow it
    if (error.isOperational) {
      throw error;
    }
    
    // Otherwise, wrap it in an appropriate error
    throw new InternalServerError('Authentication service error');
  }
}));

// GET /auth/profile - Protected route
router.get('/profile', authenticateToken, getUserProfile);

module.exports = router;
