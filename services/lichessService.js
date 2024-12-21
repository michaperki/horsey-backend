// backend/services/lichessService.js
const axios = require('axios');

const getGameOutcome = async (gameId) => {
  try {
    const url = `https://lichess.org/game/export/${gameId}?pgnInJson=true`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const gameData = response.data;

    if (!gameData || !gameData.players) {
      throw new Error('Invalid game data received from Lichess.');
    }

    const white = gameData.players.white;
    const black = gameData.players.black;

    let outcome = 'draw';

    if (gameData.winner === 'white') {
      outcome = 'white';
    } else if (gameData.winner === 'black') {
      outcome = 'black';
    }

    return {
      success: true,
      outcome,
      white: white.user.name,
      black: black.user.name,
      status: gameData.status, // e.g., 'mate', 'resign', 'draw'
    };
  } catch (error) {
    console.error(`Error fetching game outcome for Game ID ${gameId}:`, error.message);
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
    };
  }
};

module.exports = { getGameOutcome };
