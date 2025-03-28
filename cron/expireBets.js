// backend/cron/expireBets.js
const cron = require('node-cron');
const Bet = require('../models/Bet');
const User = require('../models/User');
const { DatabaseError } = require('../utils/errorTypes');
const { sendNotification } = require('../services/notificationService');

/**
 * Finds and processes expired bets
 * @returns {Promise<Object>} Results of the expiration process
 */
async function processExpiredBets() {
  try {
    // Find all bets that are pending and have expired
    const expiredBets = await Bet.find({
      status: 'pending',
      expiresAt: { $lte: new Date() },
    });

    if (expiredBets.length === 0) {
      return { expired: 0, errors: 0 };
    }

    console.log(`Found ${expiredBets.length} expired bets to process`);
    
    const results = {
      expired: 0,
      errors: 0,
      errorDetails: []
    };

    for (let bet of expiredBets) {
      try {
        bet.status = 'expired';
        await bet.save();

        // Restore the creator's balance
        if (bet.creatorId) {
          const creator = await User.findById(bet.creatorId);
          if (creator) {
            // Determine which balance to restore
            if (bet.currencyType === 'sweepstakes') {
              creator.sweepstakesBalance += bet.amount;
            } else {
              creator.tokenBalance += bet.amount;
            }
            await creator.save();
            
            // Send notification to the user
            await sendNotification(
              creator._id,
              `Your bet of ${bet.amount} ${bet.currencyType}s has expired and been refunded.`,
              'betExpired'
            );
          }
        }
        
        results.expired++;
      } catch (error) {
        console.error(`Error processing expired bet ${bet._id}:`, error);
        results.errors++;
        results.errorDetails.push({
          betId: bet._id,
          error: error.message
        });
      }
    }

    if (results.expired > 0) {
      console.log(`Expired ${results.expired} bets successfully, with ${results.errors} errors`);
    }
    
    return results;
  } catch (error) {
    console.error('Error in processExpiredBets:', error);
    throw new DatabaseError(`Failed to process expired bets: ${error.message}`);
  }
}

/**
 * Starts the cron job to expire pending bets
 */
function startExpiringBets() {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'cypress') {
    console.log('Bet expiration cron job skipped in test/cypress environment.');
    return;
  }
  
  // Run every minute
  cron.schedule('*/1 * * * *', async () => {
    try {
      const results = await processExpiredBets();
      
      // Only log if we actually expired some bets
      if (results.expired > 0 || results.errors > 0) {
        console.log(`Bet expiration results: ${results.expired} expired, ${results.errors} errors`);
      }
    } catch (error) {
      console.error('Error in bet expiration cron job:', error);
    }
  });
  
  console.log('Bet expiration service started. Results will be logged when bets are processed.');
}

module.exports = { 
  startExpiringBets,
  processExpiredBets
};
