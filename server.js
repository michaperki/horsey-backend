
// server.js
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const adminAuthRoutes = require('./routes/adminAuth');
const userAuthRoutes = require('./routes/userAuth');
const paymentsRoutes = require('./routes/payments');
const lichessRoutes = require('./routes/lichess');
const tokenRoutes = require('./routes/tokenRoutes');
const betRoutes = require('./routes/betRoutes');
const leaderboardRoutes = require('./routes/leaderboard');
const testEmailRoutes = require('./routes/testEmail');
const resetDatabaseRoutes = require('./routes/resetDatabase');
const testUtilsRoutes = require('./routes/testUtils');

const connectDB = require('./config/db'); // Adjusted path if necessary
const seedAdmin = require('./scripts/seedAdmin'); // Ensure correct path

const app = express();

// Allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'https://horsey-chess.netlify.app',
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

// Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_default_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' },
}));

// Connect to MongoDB
connectDB()
  .then(() => {
    console.log('MongoDB connected successfully.');
    
    // Seed the admin user after successful DB connection
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
      return seedAdmin();
    }
  })
  .then(() => {
    // Start the server after DB connection and seeding
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB or seed admin:', error);
    process.exit(1); // Exit the process with failure
  });

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
  console.log("Test utility routes added");
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

