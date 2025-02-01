
const cron = require('node-cron');
const { resetDailyGames } = require('../services/statsService');

// Resets at midnight
cron.schedule('0 0 * * *', () => {
  resetDailyGames();
  console.log('Daily games count reset');
});
