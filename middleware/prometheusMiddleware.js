// middleware/prometheusMiddleware.js - Fixed to ensure module can be imported safely

const promClient = require('prom-client');
const logger = require('../utils/logger');

// Create a Registry to register metrics
const register = new promClient.Registry();

// Define variables to hold our metrics
let httpRequestsTotal;
let httpRequestDurationMs;
let activeUsersGauge;
let betOperationsTotal;
let dbOperationsTotal;
let lichessApiCallsTotal;
let rateLimiterTotal;

try {
  // Enable collection of default metrics
  promClient.collectDefaultMetrics({ 
    register, 
    prefix: 'chess_betting_' 
  });

  // Define custom metrics
  // HTTP request counter
  httpRequestsTotal = new promClient.Counter({
    name: 'chess_betting_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
  });

  // HTTP request duration
  httpRequestDurationMs = new promClient.Histogram({
    name: 'chess_betting_http_request_duration_ms',
    help: 'Duration of HTTP requests in ms',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [register]
  });

  // Active users gauge
  activeUsersGauge = new promClient.Gauge({
    name: 'chess_betting_active_users',
    help: 'Number of active users connected via WebSockets',
    registers: [register]
  });

  // Bet operations counter
  betOperationsTotal = new promClient.Counter({
    name: 'chess_betting_bet_operations_total',
    help: 'Total number of betting operations',
    labelNames: ['operation', 'status', 'currency_type'],
    registers: [register]
  });

  // Database operations counter
  dbOperationsTotal = new promClient.Counter({
    name: 'chess_betting_db_operations_total',
    help: 'Total number of database operations',
    labelNames: ['operation', 'collection', 'status'],
    registers: [register]
  });

  // Lichess API operations counter
  lichessApiCallsTotal = new promClient.Counter({
    name: 'chess_betting_lichess_api_calls_total',
    help: 'Total number of Lichess API calls',
    labelNames: ['operation', 'status'],
    registers: [register]
  });

  // API rate limiter counter
  rateLimiterTotal = new promClient.Counter({
    name: 'chess_betting_rate_limiter_total',
    help: 'Total number of rate-limited requests',
    labelNames: ['endpoint'],
    registers: [register]
  });

  logger.info('Prometheus metrics initialized successfully');

} catch (error) {
  // Create no-op functions if Prometheus initialization fails
  logger.error('Failed to initialize Prometheus metrics', { error: error.message });
  
  const createNoOpMetric = () => ({
    inc: () => {},
    observe: () => {},
    set: () => {}
  });
  
  // Create fallback no-op metrics
  httpRequestsTotal = createNoOpMetric();
  httpRequestDurationMs = createNoOpMetric();
  activeUsersGauge = createNoOpMetric();
  betOperationsTotal = createNoOpMetric();
  dbOperationsTotal = createNoOpMetric();
  lichessApiCallsTotal = createNoOpMetric();
  rateLimiterTotal = createNoOpMetric();
}

/**
 * Middleware to collect HTTP metrics
 */
const httpMetricsMiddleware = (req, res, next) => {
  try {
    // Record start time
    const start = process.hrtime();
    
    // The following function executes on response finish
    res.on('finish', () => {
      try {
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
      } catch (error) {
        // Don't let metrics collection break the app
        logger.warn('Error recording HTTP metrics', { error: error.message });
      }
    });
  } catch (error) {
    logger.warn('Error setting up HTTP metrics middleware', { error: error.message });
  }
  
  // Always continue with the request
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
    logger.error('Error collecting metrics', { error: error.message });
    res.status(500).send(`Error collecting metrics: ${error.message}`);
  }
};

// Export the middleware and metrics
module.exports = {
  httpMetricsMiddleware,
  metricsHandler,
  register,
  metrics: {
    register,
    httpRequestsTotal,
    httpRequestDurationMs,
    activeUsersGauge,
    betOperationsTotal,
    dbOperationsTotal,
    lichessApiCallsTotal,
    rateLimiterTotal
  }
};
