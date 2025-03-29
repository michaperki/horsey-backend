// middleware/prometheusMiddleware.js - Enhanced for production with Grafana Cloud support using service accounts

const promClient = require('prom-client');
const logger = require('../utils/logger');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

// Remote write settings
const PUSH_INTERVAL_MS = 15000; // 15 seconds
let lastPushTime = 0;

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
 * Pushes metrics to Grafana Cloud Prometheus using service account token
 */
async function pushMetricsToGrafana() {
  // Check for service account token first, then fall back to username/key for backward compatibility
  if (!process.env.GRAFANA_CLOUD_PROMETHEUS_URL || 
      (!process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN && 
       (!process.env.GRAFANA_CLOUD_USERNAME || !process.env.GRAFANA_CLOUD_API_KEY))) {
    return { success: false, reason: 'Missing Grafana Cloud configuration' };
  }

  try {
    // Rate limit pushes
    const now = Date.now();
    if (now - lastPushTime < PUSH_INTERVAL_MS) {
      return { success: false, reason: 'Too soon since last push' };
    }
    lastPushTime = now;

    const metrics = await register.metrics();
    
    // Determine authorization method
    let authHeader;
    if (process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN) {
      // Service account token (preferred)
      authHeader = `Bearer ${process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN}`;
      logger.debug('Using service account token for Grafana Cloud authentication');
    } else {
      // Fall back to username/API key (legacy)
      authHeader = `Basic ${Buffer.from(`${process.env.GRAFANA_CLOUD_USERNAME}:${process.env.GRAFANA_CLOUD_API_KEY}`).toString('base64')}`;
      logger.debug('Using username/API key for Grafana Cloud authentication');
    }
    
    const response = await fetch(process.env.GRAFANA_CLOUD_PROMETHEUS_URL, {
      method: 'POST',
      body: metrics,
      headers: {
        'Content-Type': register.contentType,
        'Authorization': authHeader
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    logger.debug('Metrics pushed to Grafana Cloud successfully', {
      size: metrics.length,
      statusCode: response.status
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Error pushing metrics to Grafana Cloud', { 
      error: error.message, 
      stack: error.stack 
    });
    return { success: false, error: error.message };
  }
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

        // Try to push metrics if we're in production
        if (process.env.NODE_ENV === 'production' && 
            process.env.GRAFANA_CLOUD_PROMETHEUS_URL) {
          // Only push metrics occasionally based on a sampling rate
          // to avoid too many requests during high traffic
          if (Math.random() < 0.1) { // 10% sampling rate
            pushMetricsToGrafana().catch(err => {
              logger.warn('Background metrics push failed', { error: err.message });
            });
          }
        }
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
    // If we're in production and Grafana Cloud is configured,
    // push metrics when the endpoint is hit to ensure fresh data
    if (process.env.NODE_ENV === 'production' && 
        process.env.GRAFANA_CLOUD_PROMETHEUS_URL) {
      await pushMetricsToGrafana();
    }

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error collecting metrics', { error: error.message });
    res.status(500).send(`Error collecting metrics: ${error.message}`);
  }
};

// Setup automatic push for production
if (process.env.NODE_ENV === 'production' && 
    process.env.GRAFANA_CLOUD_PROMETHEUS_URL) {
  
  // Start periodic push to Grafana Cloud
  const pushInterval = setInterval(async () => {
    try {
      await pushMetricsToGrafana();
    } catch (err) {
      logger.error('Scheduled metrics push failed', { error: err.message });
    }
  }, PUSH_INTERVAL_MS);
  
  // Ensure clean shutdown
  process.on('SIGTERM', () => {
    clearInterval(pushInterval);
  });
  
  logger.info('Grafana Cloud metrics push enabled', {
    intervalMs: PUSH_INTERVAL_MS,
    endpoint: process.env.GRAFANA_CLOUD_PROMETHEUS_URL.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
    authMethod: process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN ? 'service account token' : 'username/API key'
  });
}

// Export the middleware and metrics
module.exports = {
  httpMetricsMiddleware,
  metricsHandler,
  pushMetricsToGrafana,
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
