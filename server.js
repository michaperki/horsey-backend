
// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db'); // Import the DB connection
const adminAuthRoutes = require('./routes/adminAuth');
const userAuthRoutes = require('./routes/userAuth');
const paymentsRoutes = require('./routes/payments');
const lichessRoutes = require('./routes/lichess');
const tokenRoutes = require('./routes/tokenRoutes');
const betRoutes = require('./routes/betRoutes'); // New Bet routes
const testEmailRoutes = require('./routes/testEmail'); // Import the test route

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', userAuthRoutes);
app.use('/adminAuth', adminAuthRoutes);
app.use('/payments', paymentsRoutes);
app.use('/lichess', lichessRoutes);
app.use('/tokens', tokenRoutes);
app.use('/bets', betRoutes);
app.use('/test-email', testEmailRoutes); // Mount the test route

// Placeholder route
app.get('/', (req, res) => {
  res.send('Chess Betting Backend is running');
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});

