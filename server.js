const express = require('express');
const cors = require('cors');
const session = require('express-session');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');  // New config import

// Import logger and logging middleware
const logger = require('./utils/logger');
const { httpLogger, detailedRequestLogger } = require('./middleware/httpLoggerMiddleware');

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

const app = express();

// Simple HTTP request logging middleware
app.use(httpLogger);

// Configure security headers with Helmet
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "https://lichess.org"],
      imgSrc: ["'self'", "data:", "https://lichess.org"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  })
);

// Use allowed origins from config for CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.cors.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`Blocked by CORS: Origin ${origin} is not allowed`, { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Add request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Detailed request/response logging middleware
app.use(detailedRequestLogger);

// Session Middleware using config values
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  },
}));

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Apply general API rate limiter
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

// Test-only routes
if (process.env.NODE_ENV === 'cypress') {
  app.use('/test', testUtilsRoutes);
  logger.info("Test utility routes added");
}

if (process.env.NODE_ENV !== 'production') {
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
