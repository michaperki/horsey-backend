// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { AuthenticationError, AuthorizationError } = require('../utils/errorTypes');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const tokenFromHeader = authHeader && authHeader.split(' ')[1];
  const tokenFromQuery = req.query.token;

  // Prefer the token from the header, fallback to query parameter
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    return next(new AuthenticationError('Access denied. No token provided.'));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return next(new AuthenticationError('Invalid token.'));
    }
    req.user = user;
    next();
  });
};

const authorizeRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return next(new AuthorizationError('Access denied. Insufficient permissions.'));
  }
  next();
};

module.exports = { authenticateToken, authorizeRole };
