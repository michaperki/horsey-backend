// backend/cron/trackGames.js

const cron = require('node-cron');
const Bet = require('../models/Bet');
const { getGameOutcome } = require('../services/lichessService');
const { processBetOutcome } = require('../services/bettingService');

// Variables to help with controlling log output
let executionCount = 0;
let lastLogTime = 0;
const LOG_INTERVAL = 60 * 60 * 1000; // Log once per hour instead of every minute

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
      
      // Find matched bets with game IDs
      const matchedBets = await Bet.find({
        status: 'matched',
        gameId: { $ne: null }
      });
      
      // Only log if we actually found bets to process or if it's time for a periodic update
      if (matchedBets.length > 0 || shouldLog) {
        console.log(`Game tracking: Found ${matchedBets.length} active games to check. [Run #${executionCount}]`);
        lastLogTime = currentTime;
      }

      // If we have matched bets to process
      if (matchedBets.length > 0) {
        for (const bet of matchedBets) {
          const { gameId } = bet;
          const gameResult = await getGameOutcome(gameId);

          if (gameResult.success) {
            console.log(`Processing concluded game: ${gameId}`);
            await processBetOutcome(gameId);
          }
        }
        
        // Log completion only when we actually processed games
        console.log(`Game tracking: Finished processing ${matchedBets.length} games.`);
      }
    } catch (error) {
      // Always log errors
      console.error('Cron Job Error:', error.message);
    }
  });

  console.log('Game tracking service started. Status will be logged hourly or when games are processed.');
}

module.exports = { startTrackingGames };