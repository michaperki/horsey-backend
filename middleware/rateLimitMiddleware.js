// Update middleware/rateLimitMiddleware.js

const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Creates and configures various rate limiters for different endpoints
 */

// General API limiter
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.api.windowMs,
  max: config.rateLimit.api.max,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 'error',
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.',
    timestamp: new Date().toISOString()
  }
});

// More strict limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts, please try again after 15 minutes.',
    timestamp: new Date().toISOString()
  }
});

// Limiter for bet placement
const betLimiter = rateLimit({
  windowMs: config.rateLimit.bet.windowMs,
  max: config.rateLimit.bet.max,
  standardHeaders: true,
  legacyHeaders: false,
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
