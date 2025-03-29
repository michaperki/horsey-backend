// Completely refactored trackGames.js with isolated metrics creation

const cron = require('node-cron');
const Bet = require('../models/Bet');
const { getGameOutcome } = require('../services/lichessService');
const { processBetOutcome } = require('../services/bettingService');
const logger = require('../utils/logger');

// Create mock metrics to ensure the code runs regardless of prometheus middleware
// This completely eliminates dependency on the prometheusMiddleware module
const createMockMetric = () => ({
  inc: () => {},
  set: () => {},
  observe: () => {}
});

// Simple mock metrics registry with consistent interface
const metrics = {
  // Mock metrics that do nothing but have the expected interface
  cronJobExecutions: createMockMetric(),
  cronJobDuration: createMockMetric(),
  trackedBetsGauge: createMockMetric(),
  lichessApiCallsTotal: createMockMetric()
};

// Try to initialize real metrics if possible, but don't break if not
try {
  // Try to import prometheusMiddleware after creating fallbacks
  const prometheusMiddleware = require('../middleware/prometheusMiddleware');
  
  // Only if we have a proper register with Counter and Gauge, replace the mocks
  if (prometheusMiddleware?.metrics?.register?.Counter && 
      prometheusMiddleware?.metrics?.register?.Gauge) {
    
    logger.info('Initializing Prometheus metrics for game tracking');
    
    // Replace mock with real metrics
    metrics.cronJobExecutions = new prometheusMiddleware.metrics.register.Counter({
      name: 'chess_betting_cron_job_executions_total',
      help: 'Total number of cron job executions',
      labelNames: ['job_name', 'status']
    });

    metrics.cronJobDuration = new prometheusMiddleware.metrics.register.Gauge({
      name: 'chess_betting_cron_job_duration_seconds',
      help: 'Duration of cron job execution in seconds',
      labelNames: ['job_name']
    });

    metrics.trackedBetsGauge = new prometheusMiddleware.metrics.register.Gauge({
      name: 'chess_betting_tracked_bets',
      help: 'Number of bets currently being tracked',
      labelNames: ['status']
    });
    
    // Use the existing lichessApiCallsTotal counter
    if (prometheusMiddleware.metrics.lichessApiCallsTotal?.inc) {
      metrics.lichessApiCallsTotal = prometheusMiddleware.metrics.lichessApiCallsTotal;
    }
  }
} catch (error) {
  logger.warn('Prometheus middleware not available for game tracking', { 
    error: error.message 
  });
  // Continue with mock metrics
}

// Variables to help with controlling log output
let executionCount = 0;
let lastLogTime = 0;
const LOG_INTERVAL = 60 * 60 * 1000; // Log once per hour instead of every minute

/**
 * Starts the cron job to track and process game outcomes.
 */
function startTrackingGames() {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'cypress') {
    logger.info('Cron job skipped in test/cypress environment.');
    return;
  }

  // Check every minute
  cron.schedule('* * * * *', async () => {
    const startTime = Date.now();
    let jobStatus = 'success';
    
    try {
      executionCount++;
      metrics.cronJobExecutions.inc({ job_name: 'trackGames', status: 'started' });
      
      logger.debug(`Starting game tracking job execution #${executionCount}`);
      
      const currentTime = Date.now();
      const shouldLog = (currentTime - lastLogTime) >= LOG_INTERVAL;
      
      // Find matched bets with game IDs
      const matchedBets = await Bet.find({
        status: 'matched',
        gameId: { $ne: null }
      });
      
      // Update metrics for matched bets
      metrics.trackedBetsGauge.set({ status: 'matched' }, matchedBets.length);
      
      // Only log if we actually found bets to process or if it's time for a periodic update
      if (matchedBets.length > 0 || shouldLog) {
        logger.info(`Game tracking: Found ${matchedBets.length} active games to check.`, {
          executionCount,
          matchedBets: matchedBets.length
        });
        lastLogTime = currentTime;
      }

      // If we have matched bets to process
      if (matchedBets.length > 0) {
        let processedGames = 0;
        let concludedGames = 0;
        
        for (const bet of matchedBets) {
          const { gameId } = bet;
          
          // Track Lichess API calls
          metrics.lichessApiCallsTotal.inc({
            operation: 'getGameOutcome',
            status: 'attempt'
          });
          
          const gameResult = await getGameOutcome(gameId);
          
          if (gameResult.success) {
            // Update metrics for successful Lichess call
            metrics.lichessApiCallsTotal.inc({
              operation: 'getGameOutcome',
              status: 'success'
            });
            
            if (gameResult.outcome) {
              logger.info(`Processing concluded game: ${gameId}`, {
                outcome: gameResult.outcome,
                whiteUsername: gameResult.whiteUsername,
                blackUsername: gameResult.blackUsername
              });
              
              await processBetOutcome(gameId);
              concludedGames++;
            }
            processedGames++;
          } else {
            // Update metrics for failed Lichess call
            metrics.lichessApiCallsTotal.inc({
              operation: 'getGameOutcome',
              status: 'failure'
            });
            
            logger.warn(`Failed to get outcome for game: ${gameId}`, {
              error: gameResult.error
            });
          }
        }
        
        // Log completion only when we actually processed games
        logger.info(`Game tracking: Finished processing games.`, {
          processed: processedGames,
          concluded: concludedGames
        });
      }
      
      // Calculate duration
      const durationSeconds = (Date.now() - startTime) / 1000;
      metrics.cronJobDuration.set({ job_name: 'trackGames' }, durationSeconds);
      
      // Record successful execution
      metrics.cronJobExecutions.inc({ job_name: 'trackGames', status: 'success' });
      
    } catch (error) {
      // Always log errors
      jobStatus = 'failure';
      logger.error('Cron Job Error:', {
        error: error.message,
        stack: error.stack,
        executionCount
      });
      
      // Record failed execution
      metrics.cronJobExecutions.inc({ job_name: 'trackGames', status: 'failure' });
    } finally {
      // Calculate duration regardless of success/failure
      const durationSeconds = (Date.now() - startTime) / 1000;
      metrics.cronJobDuration.set({ job_name: 'trackGames' }, durationSeconds);
    }
  });

  logger.info('Game tracking service started. Status will be logged hourly or when games are processed.');
}

module.exports = { startTrackingGames };
