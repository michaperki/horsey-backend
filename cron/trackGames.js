// backend/cron/trackGames.js

const cron = require('node-cron');
const Bet = require('../models/Bet');
const { getGameOutcome } = require('../services/lichessService');
const { processBetOutcome } = require('../services/bettingService');
const { ExternalServiceError, DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

// Variables to help with controlling log output
let executionCount = 0;
let lastLogTime = 0;
const LOG_INTERVAL = 60 * 60 * 1000; // Log once per hour instead of every minute

/**
 * Processes a single game outcome
 * @param {string} gameId - The ID of the game to process
 */
async function processGameOutcome(gameId) {
  try {
    const gameResult = await getGameOutcome(gameId);

    if (!gameResult.success) {
      logger.info(`Game not concluded or error encountered`, { gameId, reason: gameResult.error || 'Game not concluded' });
      return { processed: false, reason: gameResult.error || 'Game not concluded' };
    }

    logger.info('Processing concluded game', { gameId });
    await processBetOutcome(gameId);
    return { processed: true };
  } catch (error) {
    logger.error(`Error processing game`, { gameId, error: error.message, stack: error.stack });
    if (error.isOperational) {
      logger.error('Operational error details', { errorType: error.constructor.name, status: error.statusCode, errorCode: error.errorCode });
    }
    throw error;
  }
}

/**
 * Finds and processes all matched games
 * @returns {Promise<Object>} - Processing results
 */
async function findAndProcessGames() {
  try {
    const matchedBets = await Bet.find({
      status: 'matched',
      gameId: { $ne: null }
    });

    if (matchedBets.length === 0) {
      return { processed: 0, total: 0, errors: 0 };
    }

    logger.info('Found active games to check', { totalGames: matchedBets.length });

    const results = {
      processed: 0,
      errors: 0,
      total: matchedBets.length,
      errorDetails: []
    };

    for (const bet of matchedBets) {
      try {
        const { gameId } = bet;
        const result = await processGameOutcome(gameId);

        if (result.processed) {
          results.processed++;
        }
      } catch (error) {
        results.errors++;
        results.errorDetails.push({
          betId: bet._id,
          gameId: bet.gameId,
          error: error.message,
          errorType: error.constructor.name
        });
      }
    }

    return results;
  } catch (error) {
    logger.error('Error in findAndProcessGames', { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to find and process games: ${error.message}`);
  }
}

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
    try {
      executionCount++;
      const currentTime = Date.now();
      const shouldLog = (currentTime - lastLogTime) >= LOG_INTERVAL;

      if (shouldLog) {
        logger.info(`Game tracking service running`, { executionCount });
        lastLogTime = currentTime;
      }

      const results = await findAndProcessGames();

      if (results.processed > 0 || results.errors > 0 || shouldLog) {
        logger.info('Game tracking results', { 
          processed: results.processed, 
          errors: results.errors, 
          total: results.total 
        });

        if (results.errors > 0) {
          logger.error('Error details for game processing', { errorDetails: results.errorDetails });
        }
      }
    } catch (error) {
      logger.error('Cron Job Error', { error: error.message, stack: error.stack });
    }
  });

  logger.info('Game tracking service started. Status will be logged hourly or when games are processed.');
}

module.exports = { 
  startTrackingGames,
  findAndProcessGames,
  processGameOutcome
};

