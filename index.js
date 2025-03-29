// backend/index.js
const http = require('http');
const app = require('./server');
const connectDB = require('./config/db');
const dotenv = require('dotenv');
const { initializeSocket } = require('./socket');
const seedAdmin = require('./scripts/seedAdmin');
const { startTrackingGames } = require('./cron/trackGames');
const { startExpiringBets } = require('./cron/expireBets');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Global error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION! 💥', error.stack || error.toString());
  
  // Don't exit the process in development to allow for debugging
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION! 💥', reason.stack || reason.toString());
  
  // Don't exit the process in development to allow for debugging
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with enhanced logging
const io = initializeSocket(server);

// Make io accessible in your routes/controllers via app locals
app.set('io', io);

// Connect to MongoDB and start the server
async function startServer() {
  try {
    console.log('Starting server initialization...');
    
    // Connect to MongoDB
    try {
      await connectDB();
      console.log('MongoDB connected successfully.');
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error.stack);
      process.exit(1);
    }
    
    // Seed the admin user after successful DB connection
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
      try {
        await seedAdmin();
        console.log('Admin user seeded successfully.');
      } catch (error) {
        console.error('Error seeding admin user:', error.stack);
        // Continue even if seeding fails
      }
    }
    
    // Start the server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Backend server is running on port ${PORT}`);
      
      // Initialize the cron jobs
      try {
        startTrackingGames();
        startExpiringBets();
        require('./cron/resetStats'); // schedules the reset stats job
        console.log('Cron jobs for tracking games, expiring bets, and resetting stats started.');
      } catch (error) {
        console.error('Error initializing cron jobs:', error.stack);
        // Continue even if cron jobs fail to initialize
      }
    });
    
    // Listen for server close to perform cleanup
    server.on('close', () => {
      console.log('Server shutting down. Performing cleanup...');
    });
    
  } catch (error) {
    console.error('Server initialization error:', error.stack);
    process.exit(1);
  }
}

// Graceful shutdown for SIGTERM
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('💥 Process terminated!');
  });
});

// Start the server
startServer();

module.exports = server;
