// backend/index.js
const http      = require('http');
const app       = require('./server');
const connectDB = require('./config/db');
const dotenv    = require('dotenv');
const seedAdmin = require('./scripts/seedAdmin');
const { startTrackingGames }   = require('./cron/trackGames');
const { startExpiringBets }    = require('./cron/expireBets');
const manageSeasons            = require('./cron/manageSeasons');
const logger    = require('./utils/logger');
const setupGameHandlers = require('./socket/setupGameHandlers');

// Load environment variables
dotenv.config();
logger.info('Environment variables loaded.');

// Global error handlers
process.on('uncaughtException', error => {
  logger.error('UNCAUGHT EXCEPTION! 💥', error.stack || error.toString());
  if (process.env.NODE_ENV === 'production') process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION! 💥', reason.stack || reason.toString());
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

// Create HTTP server now (but delay Socket.IO hook)
const server = http.createServer(app);
logger.info('HTTP server created.');

async function startServer() {
  try {
    logger.info('Starting server initialization...');
    // 1) Connect to MongoDB
    await connectDB();
    logger.info('MongoDB connected successfully.');

    // 2) Seed admin user (if not test)
    if (!['test','cypress'].includes(process.env.NODE_ENV)) {
      try {
        await seedAdmin();
        logger.info('Admin user seeded successfully.');
      } catch (err) {
        logger.error('Error seeding admin user:', err.stack);
      }
    }

    // 3) Socket.IO setup _after_ DB is live
    const { initializeSocket } = require('./socket');
    const io = initializeSocket(server);
    app.set('io', io);
    io.on('connection', socket => {
      logger.info(`New socket connection: ${socket.id}`);
      setupGameHandlers(io, socket);
    });
    logger.info('Socket.io initialized.');

    // 4) Season initialization
    try {
      const { createInitialSeasonIfNeeded } = require('./services/seasonService');
      await createInitialSeasonIfNeeded();
      logger.info('Season initialization check completed.');
    } catch (err) {
      logger.error('Error during season initialization check:', err);
    }

    // 5) Start listening & cron jobs
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`Backend server is running on port ${PORT}`);

      try {
        startTrackingGames();
        startExpiringBets();
        require('./cron/resetStats'); // schedules reset-stats
        manageSeasons.performSeasonManagement();
        logger.info('Cron jobs for games, bets, stats, seasons started.');
      } catch (err) {
        logger.error('Error initializing cron jobs:', err.stack);
      }
    });

    server.on('close', () => {
      logger.info('Server shutting down. Performing cleanup...');
    });

  } catch (error) {
    logger.error('Server initialization error:', error.stack);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    logger.info('💥 Process terminated!');
  });
});

// Finally kick off startup
startServer();

module.exports = server;
