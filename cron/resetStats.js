// backend/cron/resetStats.js
const cron = require('node-cron');
const { resetDailyGames } = require('../services/statsService');
const { DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

/**
 * Resets daily statistics with error handling
 */
async function performDailyReset() {
  try {
    await resetDailyGames();
    logger.info('Daily games count reset successfully', { timestamp: new Date().toISOString() });
    return { success: true };
  } catch (error) {
    logger.error('Error resetting daily games', { 
      timestamp: new Date().toISOString(), 
      error: error.message, 
      stack: error.stack 
    });
    if (error.isOperational) {
      throw error;
    }
    throw new DatabaseError(`Failed to reset daily games: ${error.message}`);
  }
}

// Only start cron job if we're not in a test environment
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
  // Schedule reset at midnight every day (server timezone)
  cron.schedule('0 0 * * *', async () => {
    try {
      await performDailyReset();
    } catch (error) {
      logger.error('Failed to reset daily stats in cron job', { 
        error: error.message, 
        stack: error.stack 
      });
    }
  });
  
  logger.info('Daily stats reset cron job scheduled for midnight');
}

module.exports = {
  performDailyReset
};

