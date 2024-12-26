const axios = require('axios');
const { mockedGameOutcome } = require('../fixtures/lichessMockData');

/**
 * Returns a mocked Lichess game outcome.
 */
const getMockedGameOutcome = () => {
  console.log('MOCK_LICHESS is enabled. Returning mocked game outcome.');
  return mockedGameOutcome;
};

/**
 * Fetches the actual game outcome from Lichess API.
 * @param {string} gameId - The ID of the game.
 */
const fetchGameOutcomeFromLichess = async (gameId) => {
  const url = `https://lichess.org/game/export/${gameId}?pgnInJson=true`;
  const response = await axios.get(url, {
    headers: { 'Accept': 'application/json' },
  });
  
  const gameData = response.data;
  if (!gameData || !gameData.players) {
    throw new Error('Invalid game data received from Lichess.');
  }
  
  const { white, black } = gameData.players;
  const outcome = gameData.winner || 'draw';
  
  return {
    success: true,
    outcome,
    white: white.user.name,
    black: black.user.name,
    status: gameData.status,
  };
};

/**
 * Gets the game outcome, either mocked or real.
 * @param {string} gameId - The ID of the game.
 */
const getGameOutcome = async (gameId) => {
  try {
    if (process.env.MOCK_LICHESS === 'true') {
      return getMockedGameOutcome();
    }
    return await fetchGameOutcomeFromLichess(gameId);
  } catch (error) {
    console.error(`Error fetching game outcome for Game ID ${gameId}:`, error.message);
    
    // Return the specific error message based on error type
    if (error.message === 'Invalid game data received from Lichess.') {
      return {
        success: false,
        error: 'Invalid game data received from Lichess.'
      };
    }
    
    // For network errors, return the actual error message
    if (error.message === 'Network Error') {
      return {
        success: false,
        error: 'Network Error'
      };
    }
    
    // For API errors (e.g., 404), use the response data if available
    if (error.response?.data) {
      return {
        success: false,
        error: error.response.data
      };
    }
    
    // Default error case
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = { getGameOutcome };
