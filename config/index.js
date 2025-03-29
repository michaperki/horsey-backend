// config/index.js - Enhanced with improved Netlify detection and MongoDB URI selection

const dotenv = require('dotenv');
const path = require('path');
const logger = require('../utils/logger');

// =========== ENHANCED ENVIRONMENT DETECTION ===========

// Determine which .env file to use with explicit Netlify handling
const envFile = process.env.NODE_ENV === 'test'
  ? '.env.test'
  : (process.env.NODE_ENV === 'cypress' 
    ? '.env.cypress' 
    : (process.env.NODE_ENV === 'production' ? '.env.production' : '.env'));

// Load configuration from the appropriate .env file
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// ========= IMPROVED ENVIRONMENT LOGGING =========

// Detect Netlify explicitly - sometimes process.env.NETLIFY might not be reliable
const isNetlify = !!process.env.NETLIFY || 
                  !!process.env.NETLIFY_DEV || 
                  process.env.DEPLOY_PLATFORM === 'netlify';

const isHeroku = !!process.env.DYNO;

// Enhanced environment logging
console.log('====== ENVIRONMENT DETECTION DEBUG ======');
console.log(`NODE_ENV: '${process.env.NODE_ENV || 'not set'}'`);
console.log(`envFile: '${envFile}'`);
console.log(`isNetlify detected: ${isNetlify}`);
console.log(`isHeroku detected: ${isHeroku}`);
console.log(`MONGODB_URI_PROD exists: ${!!process.env.MONGODB_URI_PROD}`);
console.log(`MONGODB_URI exists: ${!!process.env.MONGODB_URI}`);
console.log(`MONGODB_URI_DEV exists: ${!!process.env.MONGODB_URI_DEV}`);
console.log(`MONGODB_URI_TEST exists: ${!!process.env.MONGODB_URI_TEST}`);
console.log('=======================================');

logger.info('Environment configuration details:', {
  NODE_ENV: process.env.NODE_ENV || 'not set',
  envFile,
  isNetlify,
  isHeroku,
  MONGODB_URI_exists: !!process.env.MONGODB_URI,
  MONGODB_URI_PROD_exists: !!process.env.MONGODB_URI_PROD,
  MONGODB_URI_DEV_exists: !!process.env.MONGODB_URI_DEV,
  MONGODB_URI_TEST_exists: !!process.env.MONGODB_URI_TEST
});

/**
 * Required environment variables for the application
 */
const requiredVariables = [
  'MONGODB_URI',  // Only this one is truly required, others will be checked conditionally
  'JWT_SECRET',
  'SESSION_SECRET',
  'LICHESS_CLIENT_ID',
  'LICHESS_CLIENT_SECRET',
  'LICHESS_REDIRECT_URI',
];

/**
 * Validate required environment variables with better error handling
 */
const validateEnv = () => {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Running in test environment, skipping full env validation');
    return;
  }

  // First check the absolutely essential variable - the database URI
  const dbUriExists = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
  if (!dbUriExists) {
    const error = 'CRITICAL ERROR: No MongoDB URI defined! Applications needs MONGODB_URI or MONGODB_URI_PROD.';
    logger.error(error);
    throw new Error(error);
  }

  // Now check other variables
  const missingVars = requiredVariables.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  logger.info('All required environment variables are present');
};

/**
 * Get appropriate MongoDB URI based on environment
 * Completely rewritten with better Netlify handling
 */
const getMongoURI = () => {
  let selectedUri;
  let source;
  
  // ===== TEST ENVIRONMENTS =====
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'cypress') {
    selectedUri = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
    source = process.env.MONGODB_URI_TEST ? 'MONGODB_URI_TEST' : 'MONGODB_URI (fallback)';
    logger.info(`Using test database URI from ${source}`);
  }
  
  // ===== DEVELOPMENT ENVIRONMENT =====
  else if (process.env.NODE_ENV === 'development') {
    selectedUri = process.env.MONGODB_URI_DEV || process.env.MONGODB_URI;
    source = process.env.MONGODB_URI_DEV ? 'MONGODB_URI_DEV' : 'MONGODB_URI (fallback)';
    logger.info(`Using development database URI from ${source}`);
  }
  
  // ===== PRODUCTION ENVIRONMENT - WITH SPECIAL NETLIFY HANDLING =====
  else if (process.env.NODE_ENV === 'production' || !process.env.NODE_ENV) {
    // If we're on Netlify, use MONGODB_URI_PROD with highest priority
    if (isNetlify) {
      console.log('NETLIFY PRODUCTION ENVIRONMENT DETECTED - Using production database');
      // For Netlify, explicitly prioritize MONGODB_URI_PROD over MONGODB_URI
      selectedUri = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
      source = process.env.MONGODB_URI_PROD ? 'MONGODB_URI_PROD' : 'MONGODB_URI (fallback)';
      console.log(`Selected MongoDB URI from: ${source}`);
      
      logger.info('Netlify environment detected', {
        MONGODB_URI_PROD_exists: !!process.env.MONGODB_URI_PROD,
        MONGODB_URI_exists: !!process.env.MONGODB_URI,
        selected_source: source
      });
    }
    // For Heroku and other production environments
    else {
      selectedUri = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
      source = process.env.MONGODB_URI_PROD ? 'MONGODB_URI_PROD' : 'MONGODB_URI (fallback)';
      logger.info(`Using production database URI from ${source}`);
    }
  }
  
  // ===== DEFAULT FALLBACK - UNEXPECTED ENVIRONMENT =====
  else {
    selectedUri = process.env.MONGODB_URI;
    source = 'MONGODB_URI (default)';
    logger.info(`Using default database URI from ${source}`);
  }
  
  // Ensure we actually have a URI
  if (!selectedUri) {
    const errorMsg = `No MongoDB URI could be found for environment: ${process.env.NODE_ENV}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  // Extract database name from the URI for logging purposes
  let dbName = 'unknown';
  try {
    if (selectedUri) {
      if (selectedUri.includes('mongodb+srv://')) {
        // For Atlas connection strings
        const queryParams = selectedUri.split('?')[0];
        const pathParts = queryParams.split('/');
        dbName = pathParts[pathParts.length - 1] || 'unknown';
      } else {
        // For standard connection strings
        const parts = selectedUri.split('/');
        dbName = parts[parts.length - 1].split('?')[0] || 'unknown';
      }
    }
  } catch (error) {
    logger.warn('Could not extract database name from URI', { error: error.message });
  }
  
  // Log the selected URI with credentials hidden
  const maskedUri = selectedUri ? selectedUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') : 'undefined';
  logger.info(`Selected MongoDB URI: ${maskedUri}`, { 
    databaseName: dbName,
    source,
    environment: process.env.NODE_ENV || 'default',
    isNetlify,
    isHeroku
  });
  
  return selectedUri;
};

/**
 * Configuration object - closely matches your original 
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  server: {
    port: parseInt(process.env.PORT || '5000', 10),
    host: process.env.HOST || '0.0.0.0',
  },
  db: {
    uri: getMongoURI(),
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
  deployment: {
    isNetlify,
    isHeroku,
  }
};

// Final configuration summary
logger.info('Application configuration initialized', {
  environment: config.env,
  isNetlify,
  isHeroku,
  databaseConfigured: !!config.db.uri,
  databaseName: config.db.uri ? config.db.uri.split('/').pop().split('?')[0] : 'unknown'
});

module.exports = {
  validateEnv,
  ...config,
};
