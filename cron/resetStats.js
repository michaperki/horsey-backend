// backend/cron/resetStats.js
const cron = require('node-cron');
const { resetDailyGames } = require('../services/statsService');
const { DatabaseError } = require('../utils/errorTypes');

/**
 * Resets daily statistics with error handling
 */
async function performDailyReset() {
  try {
    await resetDailyGames();
    console.log(`[${new Date().toISOString()}] Daily games count reset successfully`);
    return { success: true };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error resetting daily games:`, error);
    
    // If it's already an operational error, re-throw it
    if (error.isOperational) {
      throw error;
    }
    
    // Otherwise, wrap it in a DatabaseError
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
      console.error('Failed to reset daily stats in cron job:', error);
    }
  });
  
  console.log('Daily stats reset cron job scheduled for midnight');
}

// Export for testing and direct use
module.exports = {
  performDailyReset
};
