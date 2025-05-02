// middleware/rateLimitMiddleware.js
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Instantiate each limiter once at module load.
 * We wrap them in a small bypass function for test/cypress envs.
 */
const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.api.windowMs,
  max: config.rateLimit.api.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.',
    timestamp: new Date().toISOString()
  }
});

const authRateLimiter = rateLimit({
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

const betRateLimiter = rateLimit({
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

/**
 * Wrap a limiter so it skips in test/cypress environments.
 */
const bypassInTest = (limiter) => (req, res, next) => {
  if (['test', 'cypress'].includes(process.env.NODE_ENV)) {
    return next();
  }
  return limiter(req, res, next);
};

module.exports = {
  apiLimiter: bypassInTest(apiRateLimiter),
  authLimiter: bypassInTest(authRateLimiter),
  betLimiter: bypassInTest(betRateLimiter),
};
