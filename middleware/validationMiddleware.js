// Create a new file for validation middleware
// middleware/validationMiddleware.js

const { body, query, param, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errorTypes');

/**
 * Middleware to validate the request and throw ValidationError if validation fails
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Execute all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format validation errors
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));

    // Throw a validation error to be caught by error handler middleware
    throw new ValidationError('Validation failed', formattedErrors);
  };
};

/**
 * Validation rules for user authentication
 */
const userAuthValidation = [
  body('email')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

/**
 * Validation rules for placing a bet
 */
const placeBetValidation = [
  body('colorPreference')
    .isIn(['white', 'black', 'random'])
    .withMessage('colorPreference must be "white", "black", or "random"'),
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('amount must be a positive number'),
  body('timeControl')
    .matches(/^\d+\|\d+$/)
    .withMessage('timeControl must be in the format "minutes|increment"'),
  body('variant')
    .isIn(['standard', 'crazyhouse', 'chess960'])
    .withMessage('variant must be "standard", "crazyhouse", or "chess960"'),
  body('currencyType')
    .isIn(['token', 'sweepstakes'])
    .withMessage('currencyType must be "token" or "sweepstakes"')
];

/**
 * Validation rules for bet history filters
 */
const betHistoryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'amount', 'gameId', 'status'])
    .withMessage('sortBy must be one of: createdAt, amount, gameId, status'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('order must be "asc" or "desc"'),
  query('status')
    .optional()
    .isIn(['pending', 'matched', 'won', 'lost', 'canceled', 'expired', 'draw'])
    .withMessage('Invalid status value'),
  query('fromDate')
    .optional()
    .isISO8601()
    .withMessage('fromDate must be a valid ISO date'),
  query('toDate')
    .optional()
    .isISO8601()
    .withMessage('toDate must be a valid ISO date'),
  query('minWager')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('minWager must be a non-negative number'),
  query('maxWager')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('maxWager must be a non-negative number'),
  query('color')
    .optional()
    .isIn(['white', 'black', 'random'])
    .withMessage('color must be "white", "black", or "random"')
];

/**
 * Validation rules for accepting a bet
 */
const acceptBetValidation = [
  param('betId')
    .custom(value => {
      if (!/^[0-9a-fA-F]{24}$/.test(value)) {
        throw new Error('Invalid bet ID format');
      }
      return true;
    })
];

module.exports = {
  validate,
  userAuthValidation,
  placeBetValidation,
  betHistoryValidation,
  acceptBetValidation
};
