// backend/server.js require('dotenv').config();
const express = require('express');
const cors = require('cors');
const adminAuthRoutes = require('./routes/adminAuth');
const userAuthRoutes = require('./routes/userAuth');
const paymentsRoutes = require('./routes/payments');
const lichessRoutes = require('./routes/lichess');
const tokenRoutes = require('./routes/tokenRoutes');
const betRoutes = require('./routes/betRoutes');
const testEmailRoutes = require('./routes/testEmail');

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

// Routes
app.use('/auth', userAuthRoutes);
app.use('/auth/admin', adminAuthRoutes);
app.use('/payments', paymentsRoutes);
app.use('/lichess', lichessRoutes);
app.use('/tokens', tokenRoutes);
app.use('/bets', betRoutes);
app.use('/email', testEmailRoutes);

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
