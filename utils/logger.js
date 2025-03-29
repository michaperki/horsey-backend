// utils/logger.js - Optimized for less verbosity
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Get environment from process.env first, try config only as fallback
const configEnv = process.env.NODE_ENV || 'development';

// Define log levels
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
});

// Create directory for logs if it doesn't exist
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Custom format for console output - more concise
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    // Only include essential metadata in console output
    const essentialMeta = {};
    if (meta.statusCode) essentialMeta.status = meta.statusCode;
    if (meta.responseTime) essentialMeta.time = `${meta.responseTime.toFixed(0)}ms`;
    if (meta.userId && meta.userId !== 'unauthenticated') essentialMeta.user = meta.userId;
    
    const metaStr = Object.keys(essentialMeta).length 
      ? ` ${JSON.stringify(essentialMeta)}`
      : '';
      
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Custom format for file output (JSON with all details)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Determine log level based on environment
const getLogLevel = () => {
  if (configEnv === 'production') return 'info';
  if (configEnv === 'test') return 'error';
  return 'debug'; // development
};

// Logger instance
const logger = winston.createLogger({
  levels: winston.config.npm.levels,
  level: getLogLevel(),
  format: fileFormat,
  defaultMeta: { service: 'chess-betting-service' },
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
  exitOnError: false,
});

// Add console transport with more concise formatting
if (configEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Add exception handling
logger.exceptions.handle(
  new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
);

// Add rejection handling
logger.rejections.handle(
  new winston.transports.File({ filename: path.join(logDir, 'rejections.log') })
);

// Helper to sanitize objects
const sanitize = (obj) => {
  if (!obj) return undefined;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return '[Circular]';
  }
};

// Add morgan stream for HTTP request logging
logger.stream = {
  write: (message) => {
    // Don't log Morgan output to console in dev (avoids duplication)
    if (configEnv !== 'production') return;
    logger.info(message.trim());
  }
};

// More concise API Request logging helper
logger.apiRequest = function(reqInfo, meta = {}) {
  if (!reqInfo) return;
  try {
    this.http(`${reqInfo.method || 'REQ'} ${reqInfo.originalUrl || 'unknown'}`, {
      requestId: reqInfo.requestId || 'no-id',
      userId: reqInfo.userId || 'unauthenticated',
      ip: reqInfo.ip || 'unknown',
      ...sanitize(meta),
      type: 'api_request'
    });
  } catch (err) {
    console.error('Error in apiRequest logger:', err);
  }
};

// More concise API Response logging helper
logger.apiResponse = function(resInfo, meta = {}) {
  if (!resInfo) return;
  try {
    this.http(`${resInfo.method || 'RES'} ${resInfo.originalUrl || 'unknown'} ${resInfo.statusCode || '???'}`, {
      requestId: resInfo.requestId || 'no-id',
      userId: resInfo.userId || 'unauthenticated',
      statusCode: resInfo.statusCode,
      responseTime: resInfo.responseTimeMs,
      ...sanitize(meta),
      type: 'api_response'
    });
  } catch (err) {
    console.error('Error in apiResponse logger:', err);
  }
};

// Auth event logging helper
logger.authEvent = function(type, userId, meta = {}) {
  try {
    this.info(`Auth: ${type}`, { 
      userId: userId || 'unauthenticated', 
      ...sanitize(meta),
      type: 'auth_event'
    });
  } catch (err) {
    console.error('Error in authEvent logger:', err);
  }
};

// Bet event logging helper
logger.betEvent = function(type, betId, userId, meta = {}) {
  try {
    this.info(`Bet: ${type}`, { 
      betId, 
      userId: userId || 'unauthenticated', 
      ...sanitize(meta),
      type: 'bet_event'
    });
  } catch (err) {
    console.error('Error in betEvent logger:', err);
  }
};

module.exports = logger;
