// Modified prometheusMiddleware.js to disable direct pushing to Grafana Cloud
// and focus on exposing metrics via the /metrics endpoint

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
let cronJobExecutions;
let cronJobDuration;
let trackedBetsGauge;

// Configure to disable direct pushing
const ENABLE_DIRECT_PUSH = false;

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

  // Cron job metrics
  cronJobExecutions = new promClient.Counter({
    name: 'chess_betting_cron_job_executions_total',
    help: 'Total number of cron job executions',
    labelNames: ['job_name', 'status'],
    registers: [register]
  });

  cronJobDuration = new promClient.Gauge({
    name: 'chess_betting_cron_job_duration_seconds',
    help: 'Duration of cron job execution in seconds',
    labelNames: ['job_name'],
    registers: [register]
  });

  trackedBetsGauge = new promClient.Gauge({
    name: 'chess_betting_tracked_bets',
    help: 'Number of bets currently being tracked',
    labelNames: ['status'],
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
  cronJobExecutions = createNoOpMetric();
  cronJobDuration = createNoOpMetric();
  trackedBetsGauge = createNoOpMetric();
}

/**
 * Middleware to collect HTTP metrics
 */
const httpMetricsMiddleware = (req, res, next) => {
  try {
    // Skip metrics for healthcheck to avoid pollution
    if (req.path === '/health' || req.path === '/favicon.ico') {
      return next();
    }

    // Record start time
    const start = process.hrtime();
    
    // The following function executes on response finish
    res.on('finish', () => {
      try {
        // Get route pattern if available, or sanitize path for high cardinality routes
        let route = req.route?.path || req.path;
        
        // Replace dynamic parts of the URL to reduce cardinality
        if (!req.route?.path && route.includes('/')) {
          // Handle routes with IDs like /api/items/123
          route = route.replace(/\/[a-f0-9]{24}(?=\/|$)/g, '/:id');
          // Handle user-specific routes like /users/johndoe
          route = route.replace(/\/users\/[^\/]+(?=\/|$)/g, '/users/:username');
          // Handle other common patterns
          route = route.replace(/\/\d+(?=\/|$)/g, '/:num');
        }
        
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
    console.log('Metrics endpoint hit');
    const metrics = await register.metrics();
    console.log(`Returning ${metrics.length} bytes of metrics data`);
    res.set('Content-Type', register.contentType);
    res.end(metrics);
  } catch (error) {
    console.error(`Error in metrics handler: ${error.message}`);
    logger.error('Error collecting metrics', { error: error.message });
    res.status(500).send(`Error collecting metrics: ${error.message}`);
  }
};

/**
 * Debug handler that returns information about the metrics setup
 */
const metricsDebugHandler = async (req, res) => {
  try {
    const metrics = await register.metrics();
    const result = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        GRAFANA_CLOUD_PROMETHEUS_URL: process.env.GRAFANA_CLOUD_PROMETHEUS_URL ? 
          `${process.env.GRAFANA_CLOUD_PROMETHEUS_URL.substring(0, 30)}...` : undefined,
        GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN_exists: !!process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN,
        GRAFANA_CLOUD_USERNAME_exists: !!process.env.GRAFANA_CLOUD_USERNAME,
      },
      metrics: {
        count: Object.keys(register.getSingleMetric()).length,
        size: metrics.length,
        sample: metrics.substring(0, 200) + '...',
      },
      metricsPushingEnabled: ENABLE_DIRECT_PUSH,
      note: "Direct metrics pushing is disabled. Use Grafana Agent or a similar collector to scrape metrics from the /metrics endpoint."
    };

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
};

// Log information about metrics pushing
if (process.env.NODE_ENV === 'production' && 
    process.env.GRAFANA_CLOUD_PROMETHEUS_URL && 
    ENABLE_DIRECT_PUSH) {
  
  console.log('Setting up automatic metrics push');
  logger.info('Grafana Cloud metrics push enabled');
  // The actual push code is now disabled
  
  console.log(`Grafana Cloud metrics push enabled`);
  console.log(`Endpoint: ${process.env.GRAFANA_CLOUD_PROMETHEUS_URL.substring(0, 30)}...`);
} else {
  console.log('Direct metrics pushing to Grafana Cloud is disabled.');
  logger.info('Direct metrics pushing to Grafana Cloud is disabled. Metrics are still collected and exposed at the /metrics endpoint.', {
    metricsEndpoint: '/metrics',
    directPushEnabled: ENABLE_DIRECT_PUSH
  });
}

// Export the middleware and metrics
module.exports = {
  httpMetricsMiddleware,
  metricsHandler,
  metricsDebugHandler,
  register,
  metrics: {
    register,
    httpRequestsTotal,
    httpRequestDurationMs,
    activeUsersGauge,
    betOperationsTotal,
    dbOperationsTotal,
    lichessApiCallsTotal,
    rateLimiterTotal,
    cronJobExecutions,
    cronJobDuration,
    trackedBetsGauge
  }
};
