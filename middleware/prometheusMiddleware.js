// middleware/prometheusMiddleware.js - Enhanced for production with Grafana Cloud support using service accounts

const promClient = require('prom-client');
const logger = require('../utils/logger');
// Fix the fetch import issue
const https = require('https');
const http = require('http');

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
 * Manual HTTP request implementation since fetch is not available
 */
function makeRequest(url, options, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const requestModule = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    console.log(`Making ${requestOptions.method} request to ${urlObj.hostname}${urlObj.pathname}`);
    
    const req = requestModule.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(responseData),
          json: () => Promise.resolve(JSON.parse(responseData))
        });
      });
    });
    
    req.on('error', (error) => {
      console.error(`Request error: ${error.message}`);
      reject(error);
    });
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

/**
 * Pushes metrics to Grafana Cloud Prometheus using service account token
 */
async function pushMetricsToGrafana() {
  // Debug logging
  console.log('pushMetricsToGrafana called');
  console.log(`GRAFANA_CLOUD_PROMETHEUS_URL exists: ${!!process.env.GRAFANA_CLOUD_PROMETHEUS_URL}`);
  console.log(`GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN exists: ${!!process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN}`);
  console.log(`GRAFANA_CLOUD_USERNAME exists: ${!!process.env.GRAFANA_CLOUD_USERNAME}`);
  
  // Check for service account token first, then fall back to username/key for backward compatibility
  if (!process.env.GRAFANA_CLOUD_PROMETHEUS_URL || 
      (!process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN && 
       (!process.env.GRAFANA_CLOUD_USERNAME || !process.env.GRAFANA_CLOUD_API_KEY))) {
    console.log('Missing Grafana Cloud configuration');
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
    console.log(`Metrics size: ${metrics.length} bytes`);
    
    // Determine authorization method
    let authHeader;
    let authMethod;
    if (process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN) {
      // Service account token (preferred)
      authHeader = `Bearer ${process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN}`;
      authMethod = 'service account token';
      console.log('Using service account token for Grafana Cloud authentication');
    } else {
      // Fall back to username/API key (legacy)
      authHeader = `Basic ${Buffer.from(`${process.env.GRAFANA_CLOUD_USERNAME}:${process.env.GRAFANA_CLOUD_API_KEY}`).toString('base64')}`;
      authMethod = 'username/API key';
      console.log('Using username/API key for Grafana Cloud authentication');
    }
    
    console.log(`Pushing metrics to: ${process.env.GRAFANA_CLOUD_PROMETHEUS_URL}`);
    console.log(`Auth method: ${authMethod}`);
    
    // Use our custom request function instead of fetch
    const response = await makeRequest(
      process.env.GRAFANA_CLOUD_PROMETHEUS_URL, 
      {
        method: 'POST',
        headers: {
          'Content-Type': register.contentType,
          'Authorization': authHeader
        }
      },
      metrics
    );
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      // Try to get the response text for better error details
      let responseText = '';
      try {
        responseText = await response.text();
      } catch (e) {
        responseText = 'Could not read response body';
      }
      console.log(`Error response: ${responseText}`);
      throw new Error(`HTTP error! Status: ${response.status}, Response: ${responseText}`);
    }
    
    // Success log
    console.log('Metrics push successful!');
    logger.debug('Metrics pushed to Grafana Cloud successfully', {
      size: metrics.length,
      statusCode: response.status
    });
    
    return { success: true };
  } catch (error) {
    // Enhanced error logging
    console.error(`Error pushing metrics to Grafana Cloud: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
    
    logger.error('Error pushing metrics to Grafana Cloud', { 
      error: error.message, 
      stack: error.stack 
    });
    return { success: false, error: error.message };
  }
}

/**
 * Force push metrics regardless of time throttling
 */
async function forcePushMetricsToGrafana() {
  // Reset the last push time to ensure we can push
  lastPushTime = 0;
  return await pushMetricsToGrafana();
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
    console.log('Metrics endpoint hit');
    // If we're in production and Grafana Cloud is configured,
    // push metrics when the endpoint is hit to ensure fresh data
    if (process.env.NODE_ENV === 'production' && 
        process.env.GRAFANA_CLOUD_PROMETHEUS_URL) {
      console.log('Attempting to push metrics from endpoint handler');
      await forcePushMetricsToGrafana();
    }

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
      }
    };

    // Try pushing metrics
    if (process.env.GRAFANA_CLOUD_PROMETHEUS_URL) {
      try {
        result.pushAttempt = await forcePushMetricsToGrafana();
      } catch (pushError) {
        result.pushAttempt = { 
          success: false, 
          error: pushError.message 
        };
      }
    } else {
      result.pushAttempt = { 
        success: false, 
        reason: 'No Grafana Cloud URL configured' 
      };
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
};

// Setup automatic push for production
if (process.env.NODE_ENV === 'production' && 
    process.env.GRAFANA_CLOUD_PROMETHEUS_URL) {
  
  console.log('Setting up automatic metrics push');
  
  // Start periodic push to Grafana Cloud
  const pushInterval = setInterval(async () => {
    try {
      console.log('Executing scheduled metrics push');
      await pushMetricsToGrafana();
    } catch (err) {
      console.error(`Scheduled metrics push failed: ${err.message}`);
      logger.error('Scheduled metrics push failed', { error: err.message });
    }
  }, PUSH_INTERVAL_MS);
  
  // Force an initial push
  setTimeout(async () => {
    try {
      console.log('Executing initial metrics push');
      await pushMetricsToGrafana();
    } catch (err) {
      console.error(`Initial metrics push failed: ${err.message}`);
    }
  }, 5000);
  
  // Ensure clean shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, cleaning up metrics push interval');
    clearInterval(pushInterval);
  });
  
  const authMethod = process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN ? 'service account token' : 'username/API key';
  logger.info('Grafana Cloud metrics push enabled', {
    intervalMs: PUSH_INTERVAL_MS,
    endpoint: process.env.GRAFANA_CLOUD_PROMETHEUS_URL.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
    authMethod
  });
  
  console.log(`Grafana Cloud metrics push enabled (${authMethod})`);
  console.log(`Push interval: ${PUSH_INTERVAL_MS}ms`);
  console.log(`Endpoint: ${process.env.GRAFANA_CLOUD_PROMETHEUS_URL.substring(0, 30)}...`);
}

// Export the middleware and metrics
module.exports = {
  httpMetricsMiddleware,
  metricsHandler,
  metricsDebugHandler,
  pushMetricsToGrafana,
  forcePushMetricsToGrafana,
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
