
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
logger.info('Environment variables loaded.');

// Global error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION! 💥', error.stack || error.toString());
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION! 💥', reason.stack || reason.toString());
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

// Create HTTP server
const server = http.createServer(app);
logger.info('HTTP server created.');

// Initialize Socket.io with enhanced logging
const io = initializeSocket(server);
logger.info('Socket.io initialized.');

// Make io accessible in your routes/controllers via app locals
app.set('io', io);

// Log new socket connections for debugging
io.on('connection', (socket) => {
  logger.info(`New socket connection: ${socket.id}`);
});

// Connect to MongoDB and start the server
async function startServer() {
  try {
    logger.info('Starting server initialization...');
    // Connect to MongoDB
    try {
      await connectDB();
      logger.info('MongoDB connected successfully.');
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error.stack);
      process.exit(1);
    }
    
    // Seed the admin user after successful DB connection
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
      try {
        await seedAdmin();
        logger.info('Admin user seeded successfully.');
      } catch (error) {
        logger.error('Error seeding admin user:', error.stack);
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
        logger.error('Error initializing cron jobs:', error.stack);
      }
    });
    
    // Listen for server close to perform cleanup
    server.on('close', () => {
      logger.info('Server shutting down. Performing cleanup...');
    });
    
  } catch (error) {
    logger.error('Server initialization error:', error.stack);
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

