// server.js
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./utils/logger');
const { httpLogger, detailedRequestLogger } = require('./middleware/httpLoggerMiddleware');
const { httpMetricsMiddleware, metricsHandler } = require('./middleware/prometheusMiddleware');

const { performSeasonManagement } = require('./cron/manageSeasons');

// Import auth middleware for protecting metrics endpoint
const { authenticateToken, authorizeRole } = require('./middleware/authMiddleware');

// Import error handling middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');
// Import rate limiting middleware
const { apiLimiter, authLimiter, betLimiter } = require('./middleware/rateLimitMiddleware');

// Import routes
const adminAuthRoutes = require('./routes/adminAuth');
const userAuthRoutes = require('./routes/userAuth');
const userRoutes = require('./routes/user');
const paymentsRoutes = require('./routes/payments');
const storeRoutes = require('./routes/store');
const lichessRoutes = require('./routes/lichess');
const betRoutes = require('./routes/betRoutes');
const leaderboardRoutes = require('./routes/leaderboard');
const testEmailRoutes = require('./routes/testEmail');
const resetDatabaseRoutes = require('./routes/resetDatabase');
const testUtilsRoutes = require('./routes/testUtils');
const notificationRoutes = require('./routes/notification');
const healthRoutes = require('./routes/health');
const seasonRoutes = require('./routes/seasons');

const app = express();
logger.info('Initializing Express app');

// Trust proxy settings
app.set('trust proxy', 1);
logger.info('Proxy trust enabled.');

// Add HTTP metrics collection middleware
app.use(httpMetricsMiddleware);
logger.info('HTTP metrics middleware added.');

// Add simple HTTP request logging
app.use(httpLogger);
logger.info('HTTP logger middleware added.');

// Configure security headers with Helmet - disable contentSecurityPolicy for Socket.io
app.use(helmet({
  contentSecurityPolicy: false
}));
logger.info('Helmet configured with modified contentSecurityPolicy for Socket.io.');

// Define allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'https://horsey-chess.netlify.app',
  'https://horsey-dd32bf69ae0e.herokuapp.com',
  ...(process.env.ADDITIONAL_CORS_ORIGINS ? process.env.ADDITIONAL_CORS_ORIGINS.split(',') : []),
];
logger.info('Configured CORS with allowed origins:', { allowedOrigins });

// CORS middleware with enhanced error handling and logging
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      logger.debug('Request with no origin allowed');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      logger.debug(`Origin allowed by CORS: ${origin}`);
      return callback(null, true);
    }
    
    logger.warn(`Blocked by CORS: Origin ${origin} is not allowed`);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Pre-flight requests handling for all routes
app.options('*', cors());
logger.info('CORS pre-flight configured.');

// Parse JSON payloads
app.use(express.json());
logger.info('express.json middleware added.');

// Add request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  logger.debug(`Assigned Request ID: ${req.id}`);
  next();
});

// Detailed request/response logging
app.use(detailedRequestLogger);
logger.info('Detailed request logger middleware added.');

// Session Middleware
app.use(session({
  secret: config.session.secret || 'cypress-test-secret',
  resave: false,
  saveUninitialized: true,
  cookie: config.session.cookie
}));
logger.info('Session middleware configured.');

// Monitoring routes - excluded from rate limiting
app.use('/health', healthRoutes);
logger.info('Health routes added.');

// Metrics endpoint - protected by authentication and admin authorization
app.get('/metrics', authenticateToken, authorizeRole('admin'), metricsHandler);
logger.info('Metrics endpoint configured.');

// Apply general API rate limiter to all routes
app.use(apiLimiter);
logger.info('Global API rate limiter applied.');

// Routes with specific rate limiters
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth/admin/login', authLimiter);
logger.info('Authentication rate limiters applied.');

// Authentication-specific routes
app.use('/auth', userAuthRoutes);
app.use('/user', userRoutes);
app.use('/auth/admin', adminAuthRoutes);
logger.info('Authentication routes registered.');

// Bet-specific routes
app.use('/bets/place', betLimiter);
app.use('/bets/accept', betLimiter);
app.use('/bets', betRoutes);
logger.info('Bet routes registered.');

// Other routes
app.use('/payments', paymentsRoutes);
app.use('/store', storeRoutes);
app.use('/lichess', lichessRoutes);
app.use('/email', testEmailRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/notifications', notificationRoutes);
logger.info('Miscellaneous routes registered.');

// Add this line where the other routes are being registered (around line 230)
app.use('/seasons', seasonRoutes);
logger.info('Season routes registered.');

// Test-only routes
if (config.env === 'cypress') {
  app.use('/test', testUtilsRoutes);
  logger.info('Test utility routes added for cypress environment.');
}

if (config.env !== 'production') {
  app.use('/reset-database', resetDatabaseRoutes);
  logger.info('Reset database route added for non-production environment.');
}

// Placeholder route
app.get('/', (req, res) => {
  res.send('Chess Betting Backend is running');
});
logger.info('Placeholder route registered.');

// 404 handler for undefined routes
app.use(notFoundHandler);
logger.info('404 not found handler registered.');

// Global error handler
app.use(errorHandler);
logger.info('Global error handler registered.');

module.exports = app;
