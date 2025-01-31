
// backend/cron/trackGames.js

const cron = require('node-cron');
const Bet = require('../models/Bet');
const { getGameOutcome } = require('../services/lichessService');
const { processBetOutcome } = require('../services/bettingService');

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
      console.log('Cron Job: Checking for concluded games...');
      const matchedBets = await Bet.find({
        status: 'matched',
        gameId: { $ne: null }
      });

      for (const bet of matchedBets) {
        const { gameId } = bet;
        const gameResult = await getGameOutcome(gameId);

        if (gameResult.success) {
          // Let the betting service handle outcome processing
          await processBetOutcome(gameId);
        }
      }

      console.log('Cron Job: Done checking for concluded games.');
    } catch (error) {
      console.error('Cron Job Error:', error.message);
    }
  });
}

module.exports = { startTrackingGames };

