
// backend/cron/expireBets.js
const cron = require('node-cron');
const Bet = require('../models/Bet');
const User = require('../models/User');

cron.schedule('*/1 * * * *', async () => {
  try {
    // Find all bets that are pending and have expired
    const expiredBets = await Bet.find({
      status: 'pending',
      expiresAt: { $lte: new Date() },
    });

    for (let bet of expiredBets) {
      bet.status = 'expired';
      await bet.save();

      // Restore the creator's balance
      if (bet.creatorId) {
        const creator = await User.findById(bet.creatorId);
        if (creator) {
          creator.balance += bet.amount;
          await creator.save();
        }
      }
    }

    if (expiredBets.length > 0) {
      console.log(`Expired ${expiredBets.length} bets`);
    }
  } catch (error) {
    console.error('Error expiring bets:', error);
  }
});
