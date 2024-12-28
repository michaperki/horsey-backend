
// backend/services/lichessService.js

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
 * Creates a Lichess game via the Lichess API.
 * Note: Lichess API does not provide a direct endpoint for creating games.
 * You may need to use a bot account or alternative methods.
 * @param {string} timeControl - The time control for the game (e.g., "5|3").
 * @param {string} whiteUserId - The ID of the user playing white.
 * @param {string} blackUserId - The ID of the user playing black.
 */
const createLichessGame = async (timeControl, whiteUserId, blackUserId) => {
  try {
    // Challenge the black user to a game with specified time control
    const challengeUrl = `https://lichess.org/api/challenge/${blackUserId}`;
    
    const response = await axios.post(challengeUrl, {
      clock: {
        initial: parseInt(timeControl.split('|')[0]) * 60, // Convert minutes to seconds
        increment: parseInt(timeControl.split('|')[1]),
      },
      variant: 'standard',
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.LICHESS_BOT_API_TOKEN}`, // Bot account token
        'Content-Type': 'application/json',
      },
    });
    
    if (response.status === 201) { // Assuming 201 Created
      return {
        success: true,
        gameId: response.data.challenge.id, // Adjust based on actual response
        gameLink: response.data.challenge.url, // Adjust based on actual response
      };
    } else {
      console.error('Unexpected response status:', response.status);
      return { success: false };
    }
  } catch (error) {
    console.error('Error creating Lichess game:', error.message);
    return { success: false };
  }
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
    
    if (error.message === 'Network Error') {
      return {
        success: false,
        error: 'Network Error'
      };
    }
    
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

module.exports = { getGameOutcome, createLichessGame };

