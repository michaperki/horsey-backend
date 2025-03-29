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
  logger.error('UNCAUGHT EXCEPTION! 💥', { 
    error: error.stack || error.toString(),
    exitCode: 1
  });
  
  // Don't exit the process in development to allow for debugging
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION! 💥', { 
    reason: reason.stack || reason.toString(),
    promise: promise.toString(),
    exitCode: 1
  });
  
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
    logger.info('Starting server initialization...');
    
    // Connect to MongoDB
    try {
      await connectDB();
      logger.info('MongoDB connected successfully.');
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', { error: error.stack });
      process.exit(1);
    }
    
    // Seed the admin user after successful DB connection
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
      try {
        await seedAdmin();
        logger.info('Admin user seeded successfully.');
      } catch (error) {
        logger.error('Error seeding admin user:', { error: error.stack });
        // Continue even if seeding fails
      }
    }
    
    // Start the server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`Backend server is running on port ${PORT}`);
      
      // Initialize the cron jobs
      try {
        startTrackingGames();
        startExpiringBets();
        require('./cron/resetStats'); // schedules the reset stats job
        logger.info('Cron jobs for tracking games, expiring bets, and resetting stats started.');
      } catch (error) {
        logger.error('Error initializing cron jobs:', { error: error.stack });
        // Continue even if cron jobs fail to initialize
      }
    });
    
    // Listen for server close to perform cleanup
    server.on('close', () => {
      logger.info('Server shutting down. Performing cleanup...');
    });
    
  } catch (error) {
    logger.error('Server initialization error:', { error: error.stack });
    process.exit(1);
  }
}

// Graceful shutdown for SIGTERM
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    logger.info('💥 Process terminated!');
  });
});

// Start the server
startServer();

module.exports = server;
