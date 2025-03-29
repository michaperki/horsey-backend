// middleware/httpLoggerMiddleware.js - Optimized for less verbosity
const morgan = require('morgan');
const logger = require('../utils/logger');

/**
 * HTTP request logger middleware using Morgan
 * Only used in production, as we use our custom logger in development
 */
const httpLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: logger.stream,
    skip: (req) => {
      // Skip health checks and OPTIONS requests to reduce noise
      return req.url === '/health' || req.method === 'OPTIONS';
    }
  }
);

/**
 * Safely sanitize objects (prevent circular refs)
 */
function sanitize(obj) {
  if (!obj) return undefined;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return '[Circular]';
  }
}

/**
 * Custom request/response logger with detailed performance metrics
 * But with filters to reduce noise
 */
const detailedRequestLogger = (req, res, next) => {
  try {
    const start = process.hrtime();
    
    // Skip logging for noisy endpoints
    const shouldSkip = 
      req.url === '/health' || 
      req.method === 'OPTIONS' ||
      req.url.startsWith('/health') ||
      req.url.startsWith('/favicon');
    
    if (!shouldSkip) {
      // Log the request
      try {
        logger.apiRequest({
          method: req.method,
          originalUrl: req.originalUrl,
          requestId: req.id || 'no-id',
          userId: req.user?.id,
          ip: req.ip || req.connection?.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
        });
      } catch (err) {
        console.error('Error logging request:', err);
      }
    }
    
    // Patch the response.end method to log when the response is sent
    const originalEnd = res.end;
    res.end = function(...args) {
      // Record response time and log response
      if (!shouldSkip) {
        try {
          const hrTime = process.hrtime(start);
          const responseTimeMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
          
          // Only log essential request body fields if not GET
          let reqBody;
          if (req.method !== 'GET' && req.body) {
            // Filter out sensitive fields and only include necessary ones
            const { password, token, ...safeBody } = req.body;
            reqBody = Object.keys(safeBody).length > 0 ? safeBody : undefined;
          }
          
          logger.apiResponse({
            method: req.method,
            originalUrl: req.originalUrl,
            statusCode: res.statusCode,
            requestId: req.id || 'no-id',
            userId: req.user?.id,
            responseTimeMs,
            ip: req.ip || req.connection?.remoteAddress || 'unknown',
            reqBody: reqBody,
            query: Object.keys(req.query).length > 0 ? sanitize(req.query) : undefined,
            params: Object.keys(req.params).length > 0 ? sanitize(req.params) : undefined,
          });
        } catch (err) {
          console.error('Error logging response:', err);
        }
      }
      
      // Call the original end method
      return originalEnd.apply(res, args);
    };
    
    next();
  } catch (err) {
    console.error('Error in detailed request logger middleware:', err);
    next(); // Continue even if logging fails
  }
};

module.exports = {
  httpLogger,
  detailedRequestLogger
};
