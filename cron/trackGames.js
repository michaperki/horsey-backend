// backend/cron/trackGames.js

const cron = require('node-cron');
const Bet = require('../models/Bet');
const { getGameOutcome } = require('../services/lichessService');
const { processBetOutcome } = require('../services/bettingService');
const { ExternalServiceError, DatabaseError } = require('../utils/errorTypes');

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
      console.log(`Game ${gameId} is not concluded yet or had an error: ${gameResult.error}`);
      return { processed: false, reason: gameResult.error || 'Game not concluded' };
    }
    
    console.log(`Processing concluded game: ${gameId}`);
    await processBetOutcome(gameId);
    return { processed: true };
  } catch (error) {
    console.error(`Error processing game ${gameId}:`, error.message);
    
    // Log more details if it's one of our custom error types
    if (error.isOperational) {
      console.error(`Error type: ${error.constructor.name}, Status: ${error.statusCode}, Code: ${error.errorCode}`);
    }
    
    throw error; // Let the caller handle it
  }
}

/**
 * Finds and processes all matched games
 * @returns {Promise<Object>} - Processing results
 */
async function findAndProcessGames() {
  try {
    // Find matched bets with game IDs
    const matchedBets = await Bet.find({
      status: 'matched',
      gameId: { $ne: null }
    });
    
    if (matchedBets.length === 0) {
      return { 
        processed: 0, 
        total: 0, 
        errors: 0 
      };
    }
    
    console.log(`Found ${matchedBets.length} active games to check.`);
    
    const results = {
      processed: 0,
      errors: 0,
      total: matchedBets.length,
      errorDetails: []
    };
    
    // Process each game
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
    console.error('Error in findAndProcessGames:', error);
    throw new DatabaseError(`Failed to find and process games: ${error.message}`);
  }
}

/**
 * Starts the cron job to track and process game outcomes.
 */
function startTrackingGames() {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'cypress') {
    console.log('Cron job skipped in test/cypress environment.');
    return;
  }

  // Check every minute
  cron.schedule('* * * * *', async () => {
    try {
      executionCount++;
      const currentTime = Date.now();
      const shouldLog = (currentTime - lastLogTime) >= LOG_INTERVAL;
      
      if (shouldLog) {
        console.log(`Game tracking service running. [Execution #${executionCount}]`);
        lastLogTime = currentTime;
      }
      
      const results = await findAndProcessGames();
      
      // Log results if we processed any games or if it's time for a periodic update
      if (results.processed > 0 || results.errors > 0 || shouldLog) {
        console.log(`Game tracking results: ${results.processed} processed, ${results.errors} errors out of ${results.total} games.`);
        
        if (results.errors > 0) {
          console.error('Error details:', results.errorDetails);
        }
      }
    } catch (error) {
      // Always log errors
      console.error('Cron Job Error:', error.message);
      
      // Add stack trace for non-operational errors
      if (!error.isOperational) {
        console.error('Stack trace:', error.stack);
      }
    }
  });

  console.log('Game tracking service started. Status will be logged hourly or when games are processed.');
}

// Export for testing and direct use
module.exports = { 
  startTrackingGames,
  findAndProcessGames,
  processGameOutcome
};
