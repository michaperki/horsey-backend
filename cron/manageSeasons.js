// backend/cron/manageSeasons.js

const cron = require('node-cron');
const { processSeasonTransitions, createInitialSeasonIfNeeded } = require('../services/seasonService');
const { DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

/**
 * Process season transitions daily
 * - Checks for season transitions that need to happen
 * - Distributes rewards for ended seasons
 * - Activates upcoming seasons
 * - Creates new seasons when needed
 */
async function performSeasonManagement() {
  try {
    logger.info('Running scheduled season management');
    
    // Ensure at least one season exists
    await createInitialSeasonIfNeeded();
    
    // Process any needed transitions
    await processSeasonTransitions();
    
    logger.info('Season management completed successfully');
    return { success: true };
  } catch (error) {
    logger.error('Error during season management', { 
      error: error.message, 
      stack: error.stack 
    });
    
    if (error.isOperational) {
      throw error;
    }
    
    throw new DatabaseError(`Failed to manage seasons: ${error.message}`);
  }
}

// Only start cron job if we're not in a test environment
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
  // Run at midnight every day
  cron.schedule('0 0 * * *', async () => {
    try {
      await performSeasonManagement();
    } catch (error) {
      logger.error('Failed to execute season management cron job', { 
        error: error.message, 
        stack: error.stack 
      });
    }
  });
  
  // Also run at every hour to ensure we catch season transitions close to the hour
  cron.schedule('0 * * * *', async () => {
    try {
      await processSeasonTransitions();
    } catch (error) {
      logger.error('Failed to execute hourly season transition check', { 
        error: error.message, 
        stack: error.stack 
      });
    }
  });
  
  logger.info('Season management cron jobs scheduled');
}

module.exports = {
  performSeasonManagement
};
