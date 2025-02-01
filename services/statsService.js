
let gamesPlayedToday = 0;

const Bet = require('../models/Bet');

async function getStats(onlineUsers) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const gamesPlayed = await Bet.countDocuments({
    createdAt: { $gte: startOfDay },
    gameId: { $ne: null }
  });
  return { onlineUsers, gamesPlayed };
}

module.exports = { getStats };

function incrementGames() {
  gamesPlayedToday++;
}

function resetDailyGames() {
  gamesPlayedToday = 0;
}

module.exports = { getStats, incrementGames, resetDailyGames };
