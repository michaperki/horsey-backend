// backend/index.js

const http = require('http');
const app = require('./server');
const connectDB = require('./config/db');
const dotenv = require('dotenv');
const { initializeSocket } = require('./socket');
const jwt = require('jsonwebtoken');
const { startTrackingGames } = require('./cron/trackGames');
const { startExpiringBets } = require('./cron/expireBets');
const seedAdmin = require('./scripts/seedAdmin');

dotenv.config();

// Global error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', error);
  // Log to error monitoring service, if available
  // You could also implement graceful shutdown logic here
  process.exit(1);
});

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...', error);
  // Log to error monitoring service, if available
  // You could also implement graceful shutdown logic here
  process.exit(1);
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with enhanced logging
const io = initializeSocket(server);

// Make io accessible in your routes/controllers via app locals
app.set('io', io);

// Connect to MongoDB and start the server
connectDB()
  .then(async () => {
    console.log('MongoDB connected successfully.');

    // Seed the admin user after successful DB connection
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
      await seedAdmin();
      console.log('Admin user seeded successfully.');
    }

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Backend server is running on port ${PORT}`);
      
      // Initialize the cron jobs
      startTrackingGames();
      startExpiringBets();
      require('./cron/resetStats'); // schedules the reset stats job

      console.log('Cron jobs for tracking games, expiring bets, and resetting stats started.');
    });
    
    // Listen for server close to perform cleanup
    server.on('close', () => {
      console.log('Server shutting down. Performing cleanup...');
      // Cleanup logic here if needed
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB or seed admin:', error);
    process.exit(1); // Exit the process with failure
  });

// Graceful shutdown for SIGTERM 
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('💥 Process terminated!');
  });
});

module.exports = server; // Export the server for testing and other purposes
