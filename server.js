// server.js - Updated with centralized error handling
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid'); // Add this package for request IDs

// Import error handling middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');

// Load environment variables
dotenv.config();

// Import routes
const adminAuthRoutes = require('./routes/adminAuth');
const userAuthRoutes = require('./routes/userAuth');
const userRoutes = require('./routes/user');
const paymentsRoutes = require('./routes/payments');
const storeRoutes = require('./routes/store');
const lichessRoutes = require('./routes/lichess');
const betRoutes = require('./routes/betRoutes');
const leaderboardRoutes = require('./routes/leaderboard');
const testEmailRoutes = require('./routes/testEmail');
const resetDatabaseRoutes = require('./routes/resetDatabase');
const testUtilsRoutes = require('./routes/testUtils');
const notificationRoutes = require('./routes/notification');

const app = express();

// Allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5000/',
  'https://horsey-chess.netlify.app',
  'https://horsey-dd32bf69ae0e.herokuapp.com'
];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`Blocked by CORS: Origin ${origin} is not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Add request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  // Add the request ID to response headers for debugging
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_default_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' },
}));

// Routes
app.use('/auth', userAuthRoutes);
app.use('/user', userRoutes);
app.use('/auth/admin', adminAuthRoutes);
app.use('/payments', paymentsRoutes);
app.use('/store', storeRoutes);
app.use('/lichess', lichessRoutes);
app.use('/bets', betRoutes);
app.use('/email', testEmailRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/notifications', notificationRoutes);

// Test-only routes
if (process.env.NODE_ENV === 'cypress') {
  app.use('/test', testUtilsRoutes);
  console.log("Test utility routes added");
}

if (process.env.NODE_ENV !== 'production') {
  app.use('/reset-database', resetDatabaseRoutes);
}

// Placeholder route
app.get('/', (req, res) => {
  res.send('Chess Betting Backend is running');
});

// Apply the 404 handler for undefined routes
app.use(notFoundHandler);

// Apply the global error handler as the last middleware
app.use(errorHandler);

module.exports = app; // Export the app for testing and server setup
