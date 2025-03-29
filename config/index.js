const dotenv = require('dotenv');
const path = require('path');
const logger = require('../utils/logger');

// Determine which .env file to use
const envFile = process.env.NODE_ENV === 'test'
  ? '.env.test'
  : (process.env.NODE_ENV === 'cypress' ? '.env.cypress' : '.env');

// Load configuration from the appropriate .env file
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

/**
 * Required environment variables for the application
 */
const requiredVariables = [
  'MONGODB_URI',
  'JWT_SECRET',
  'SESSION_SECRET',
  'LICHESS_CLIENT_ID',
  'LICHESS_CLIENT_SECRET',
  'LICHESS_REDIRECT_URI',
];

/**
 * Validate required environment variables
 */
const validateEnv = () => {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Running in test environment, skipping full env validation');
    return;
  }
  const missingVars = requiredVariables.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
};

/**
 * Configuration object
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  server: {
    port: parseInt(process.env.PORT || '5000', 10),
    host: process.env.HOST || '0.0.0.0',
  },
  db: {
    uri: process.env.NODE_ENV === 'test'
      ? process.env.MONGODB_URI_TEST
      : process.env.MONGODB_URI,
    options: {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  session: {
    secret: process.env.SESSION_SECRET,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  },
  lichess: {
    clientId: process.env.LICHESS_CLIENT_ID,
    clientSecret: process.env.LICHESS_CLIENT_SECRET,
    redirectUri: process.env.LICHESS_REDIRECT_URI,
    scopes: process.env.LICHESS_SCOPES || 'challenge:read challenge:write',
  },
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    service: process.env.EMAIL_SERVICE || 'Gmail',
  },
  admin: {
    username: process.env.INITIAL_ADMIN_USERNAME,
    email: process.env.INITIAL_ADMIN_EMAIL,
    password: process.env.INITIAL_ADMIN_PASSWORD,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  cors: {
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:5000',
      'https://horsey-chess.netlify.app',
      'https://horsey-dd32bf69ae0e.herokuapp.com',
      ...(process.env.ADDITIONAL_CORS_ORIGINS
          ? process.env.ADDITIONAL_CORS_ORIGINS.split(',')
          : []),
    ],
  },
  rateLimit: {
    api: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_API || '100', 10),
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_AUTH || '5', 10),
    },
    bet: {
      windowMs: 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_BET || '10', 10),
    },
  },
};

module.exports = {
  validateEnv,
  ...config,
};

