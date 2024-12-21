
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const adminAuthRoutes = require('./routes/adminAuth');
const userAuthRoutes = require('./routes/userAuth');
const paymentsRoutes = require('./routes/payments');
const lichessRoutes = require('./routes/lichess');
const tokenRoutes = require('./routes/tokenRoutes');
const betRoutes = require('./routes/betRoutes');

const app = express();

// Connect to MongoDB only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

// Allowed origins
const allowedOrigins = [
  'http://localhost:3000',         // Local development
  'https://horsey-chess.netlify.app' // Production frontend
];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent
}));
app.use(express.json());

// Routes
app.use('/auth/user', userAuthRoutes);
app.use('/auth/admin', adminAuthRoutes);
app.use('/payments', paymentsRoutes);
app.use('/lichess', lichessRoutes);
app.use('/tokens', tokenRoutes);
app.use('/bets', betRoutes);

// Placeholder route
app.get('/', (req, res) => {
  res.send('Chess Betting Backend is running');
});

// Start the server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Backend server is running on port ${PORT}`);
  });
}

module.exports = app; // Export the app for testing

