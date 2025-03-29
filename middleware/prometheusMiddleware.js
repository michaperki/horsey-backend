// Install the required package:
// 
// Create a new file: middleware/prometheusMiddleware.js

const promClient = require('prom-client');
const config = require('../config');

// Enable collection of default metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;

// Define a custom prefix for metrics
const prefix = 'chess_betting_';

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics
collectDefaultMetrics({ register, prefix });

// Define custom metrics

// HTTP request counter
const httpRequestsTotal = new promClient.Counter({
  name: `${prefix}http_requests_total`,
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// HTTP request duration
const httpRequestDurationMs = new promClient.Histogram({
  name: `${prefix}http_request_duration_ms`,
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register]
});

// Active users gauge
const activeUsersGauge = new promClient.Gauge({
  name: `${prefix}active_users`,
  help: 'Number of active users connected via WebSockets',
  registers: [register]
});

// Bet operations counter
const betOperationsTotal = new promClient.Counter({
  name: `${prefix}bet_operations_total`,
  help: 'Total number of betting operations',
  labelNames: ['operation', 'status', 'currency_type'],
  registers: [register]
});

// Database operations counter
const dbOperationsTotal = new promClient.Counter({
  name: `${prefix}db_operations_total`,
  help: 'Total number of database operations',
  labelNames: ['operation', 'collection', 'status'],
  registers: [register]
});

// Lichess API operations counter
const lichessApiCallsTotal = new promClient.Counter({
  name: `${prefix}lichess_api_calls_total`,
  help: 'Total number of Lichess API calls',
  labelNames: ['operation', 'status'],
  registers: [register]
});

// API rate limiter counter
const rateLimiterTotal = new promClient.Counter({
  name: `${prefix}rate_limiter_total`,
  help: 'Total number of rate-limited requests',
  labelNames: ['endpoint'],
  registers: [register]
});

/**
 * Middleware to collect HTTP metrics
 */
const httpMetricsMiddleware = (req, res, next) => {
  // Record start time
  const start = process.hrtime();
  
  // The following function executes on response finish
  res.on('finish', () => {
    // Get route pattern if available
    const route = req.route?.path || req.path;
    
    // Calculate duration
    const duration = process.hrtime(start);
    const durationMs = duration[0] * 1000 + duration[1] / 1000000;
    
    // Increment request counter
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode
    });
    
    // Observe request duration
    httpRequestDurationMs.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode
      },
      durationMs
    );
  });
  
  next();
};

/**
 * Route handler for metrics endpoint
 */
const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).send(`Error collecting metrics: ${error.message}`);
  }
};

// Export the middleware and metrics
module.exports = {
  httpMetricsMiddleware,
  metricsHandler,
  register,
  metrics: {
    httpRequestsTotal,
    httpRequestDurationMs,
    activeUsersGauge,
    betOperationsTotal,
    dbOperationsTotal,
    lichessApiCallsTotal,
    rateLimiterTotal
  }
};
