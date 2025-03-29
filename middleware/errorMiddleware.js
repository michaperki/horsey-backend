// backend/middleware/errorMiddleware.js
const { AppError } = require('../utils/errorTypes');
const logger = require('../utils/logger'); // Use structured logger

/**
 * Central error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error with structured logging
  logger.error(`${err.name}: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.id, // Assuming a request ID is added in earlier middleware
    userId: req.user?.id || 'unauthenticated',
  });

  // Default error values if not an AppError
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'UNKNOWN_ERROR';
  let message = err.message || 'Something went wrong';
  let data = err.data || null;

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    data = Object.values(err.errors).map(error => ({
      field: error.path,
      message: error.message
    }));
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    statusCode = 409;
    errorCode = 'DUPLICATE_ERROR';
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value for ${field}`;
    data = err.keyValue;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Token expired';
  }

  // Send standardized error response
  res.status(statusCode).json({
    status: 'error',
    errorCode,
    message,
    data,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Middleware to catch async errors without try-catch blocks
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Middleware to handle 404 errors for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND');
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler
};

