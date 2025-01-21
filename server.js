
const express = require('express');
const cors = require('cors');
const session = require('express-session'); // **New Dependency**
const adminAuthRoutes = require('./routes/adminAuth');
const userAuthRoutes = require('./routes/userAuth');
const paymentsRoutes = require('./routes/payments');
const lichessRoutes = require('./routes/lichess');
const tokenRoutes = require('./routes/tokenRoutes');
const betRoutes = require('./routes/betRoutes');
const leaderboardRoutes = require('./routes/leaderboard')
const testEmailRoutes = require('./routes/testEmail');
const resetDatabaseRoutes = require('./routes/resetDatabase');
const testUtilsRoutes = require('./routes/testUtils');

const dotenv = require('dotenv');
dotenv.config();

const app = express();

// Allowed origins
const allowedOrigins = [
  'http://localhost:3000',                   // Local development
  'http://localhost:5000',                   // Cypress Test development
  'http://localhost:5000/',
  'https://horsey-chess.netlify.app',        // Production frontend
];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`Blocked by CORS: Origin ${origin} is not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent
}));

app.use(express.json());

// **Session Middleware**
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_default_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }, // Use secure cookies in production
}));

// Routes
app.use('/auth', userAuthRoutes);
app.use('/auth/admin', adminAuthRoutes);
app.use('/payments', paymentsRoutes);
app.use('/lichess', lichessRoutes);
app.use('/tokens', tokenRoutes);
app.use('/bets', betRoutes);
app.use('/email', testEmailRoutes);
app.use('/leaderboard', leaderboardRoutes);

// Test-only routes
if (process.env.NODE_ENV === 'cypress') {
  app.use('/test', testUtilsRoutes);
  console.log("test utility routes added")
}

// server.js
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
  const seedAdmin = require('./scripts/seedAdmin');
  seedAdmin();
}

if (process.env.NODE_ENV !== 'production') {
  app.use('/reset-database', resetDatabaseRoutes);
}

// Placeholder route
app.get('/', (req, res) => {
  res.send('Chess Betting Backend is running');
});

// Error handler for CORS
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS error: Origin not allowed' });
  }
  next(err);
});

module.exports = app; // Export the app for testing

