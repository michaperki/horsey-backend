// middleware/rateLimitMiddleware.js
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Creates and configures various rate limiters for different endpoints
 * Bypasses rate limiting in test/cypress environments
 */

// Helper function to create a rate limiter that bypasses tests
const createRateLimiter = (options) => {
  // Create a middleware that checks environment first
  return (req, res, next) => {
    // Skip rate limiting in test/cypress environment
    if (process.env.NODE_ENV === 'cypress' || process.env.NODE_ENV === 'test') {
      return next();
    }
    
    // For non-test environments, apply the actual rate limiter
    const limiter = rateLimit({
      ...options,
      standardHeaders: true,
      legacyHeaders: false
    });
    
    return limiter(req, res, next);
  };
};

// General API limiter
const apiLimiter = createRateLimiter({
  windowMs: config.rateLimit.api.windowMs,
  max: config.rateLimit.api.max,
  message: {
    status: 'error',
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.',
    timestamp: new Date().toISOString()
  }
});

// More strict limiter for authentication endpoints
const authLimiter = createRateLimiter({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.max,
  message: {
    status: 'error',
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts, please try again after 15 minutes.',
    timestamp: new Date().toISOString()
  }
});

// Limiter for bet placement
const betLimiter = createRateLimiter({
  windowMs: config.rateLimit.bet.windowMs,
  max: config.rateLimit.bet.max,
  message: {
    status: 'error',
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many betting operations, please slow down.',
    timestamp: new Date().toISOString()
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  betLimiter
};
