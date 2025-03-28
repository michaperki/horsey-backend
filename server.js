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

const app = express();

app.set('trust proxy', 1);

// Add HTTP metrics collection middleware
app.use(httpMetricsMiddleware);

// Add simple HTTP request logging
app.use(httpLogger);

// Configure security headers with Helmet - but modify for Socket.io
app.use(helmet({
  // Disable contentSecurityPolicy for Socket.io to work properly
  contentSecurityPolicy: false
}));

// Define allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'https://horsey-chess.netlify.app',
  'https://horsey-dd32bf69ae0e.herokuapp.com',
  ...(process.env.ADDITIONAL_CORS_ORIGINS
      ? process.env.ADDITIONAL_CORS_ORIGINS.split(',')
      : []),
];

// Log allowed origins for debugging
logger.info('Configured CORS with allowed origins:', { allowedOrigins });

// CORS middleware with enhanced error handling and logging
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc)
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Pre-flight requests handling for all routes
app.options('*', cors());

app.use(express.json());

// Add request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Detailed request/response logging
app.use(detailedRequestLogger);

// Session Middleware
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: true,
  cookie: config.session.cookie
}));

// Monitoring routes - these should be excluded from rate limiting
app.use('/health', healthRoutes);

// Add these routes to handle Prometheus API compatibility
app.post('/api/v1/query', (req, res) => {
  // Simple compatibility endpoint for Grafana
  res.json({
    "status": "success",
    "data": {
      "resultType": "vector",
      "result": []
    }
  });
});

app.get('/api/v1/status/buildinfo', (req, res) => {
  // Return a simple buildinfo response
  res.json({
    "status": "success",
    "data": {
      "version": "1.0.0",
      "revision": "custom",
      "branch": "main",
      "buildUser": "horsey",
      "buildDate": new Date().toISOString(),
      "goVersion": "node-v18"
    }
  });
});

// Keep your existing metrics endpoint
app.get('/metrics', metricsHandler);

// Apply general API rate limiter to all routes
app.use(apiLimiter);

// Routes with specific rate limiters
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth/admin/login', authLimiter);

// Authentication-specific routes
app.use('/auth', userAuthRoutes);
app.use('/user', userRoutes);
app.use('/auth/admin', adminAuthRoutes);

// Bet-specific routes
app.use('/bets/place', betLimiter);
app.use('/bets/accept', betLimiter);
app.use('/bets', betRoutes);

// Other routes
app.use('/payments', paymentsRoutes);
app.use('/store', storeRoutes);
app.use('/lichess', lichessRoutes);
app.use('/email', testEmailRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/notifications', notificationRoutes);

// Add this route before your other metrics route
app.get('/debug-grafana', (req, res) => {
  const { metricsDebugHandler } = require('./middleware/prometheusMiddleware');
  return metricsDebugHandler(req, res);
});

// Add debug endpoint for token info (don't expose in production!)
app.get('/debug-token', (req, res) => {
  const username = process.env.GRAFANA_CLOUD_USERNAME || '2351791';
  const token = process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN || 'not-set';
  const maskedToken = token.substring(0, 10) + '...' + token.substring(token.length - 5);
  
  res.json({
    username,
    token_format: token.startsWith('glc_') ? 'Valid format (starts with glc_)' : 'Invalid format',
    token_masked: maskedToken,
    auth_header_type: 'Basic',
    example_header: `Basic ${Buffer.from(`${username}:${token.substring(0, 5)}...`).toString('base64')}`,
    url: process.env.GRAFANA_CLOUD_PROMETHEUS_URL ? 
      process.env.GRAFANA_CLOUD_PROMETHEUS_URL.substring(0, 30) + '...' : 'not-set'
  });
});

// Test-only routes
if (config.env === 'cypress') {
  app.use('/test', testUtilsRoutes);
  logger.info("Test utility routes added");
}

if (config.env !== 'production') {
  app.use('/reset-database', resetDatabaseRoutes);
}

// Placeholder route
app.get('/', (req, res) => {
  res.send('Chess Betting Backend is running');
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;
