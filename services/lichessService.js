
// backend/services/lichessService.js

const axios = require('axios');
const qs = require('qs');
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
 * Example implementation of getGameOutcome
 * You need to adjust this based on your actual logic.
 */
const getGameOutcome = async (gameId) => {
  if (process.env.MOCK_LICHESS === 'true') {
    return getMockedGameOutcome();
  }
  return await fetchGameOutcomeFromLichess(gameId);
};

/**
 * Creates a Lichess game via the Lichess API.
 * @param {string} timeControl - The time control for the game (e.g., "5|3").
 * @param {string} whiteUsername - The Lichess username of the user playing white.
 * @param {string} blackUsername - The Lichess username of the user playing black.
 * @returns {Object} - An object containing success status and game details if successful.
 */
const createLichessGame = async (timeControl, whiteUsername, blackUsername) => {
  console.log(`[createLichessGame] Initiating game creation with parameters: timeControl=${timeControl}, whiteUsername=${whiteUsername}, blackUsername=${blackUsername}`);
  
  try {
    // Validate input parameters
    if (!timeControl || !whiteUsername || !blackUsername) {
      console.error('[createLichessGame] Missing required parameters.');
      return { success: false, error: 'Missing required parameters.' };
    }

    // Construct the challenge URL using the black player's username
    const challengeUrl = `https://lichess.org/api/challenge/${blackUsername}`;
    console.log(`[createLichessGame] Challenge URL: ${challengeUrl}`);

    // Parse the time control
    const [minutesStr, incrementStr] = timeControl.split('|');
    const minutes = parseInt(minutesStr, 10);
    const increment = parseInt(incrementStr, 10);

    if (isNaN(minutes) || isNaN(increment)) {
      console.error('[createLichessGame] Invalid timeControl format. Expected format "minutes|increment".');
      return { success: false, error: 'Invalid timeControl format.' };
    }

    // Prepare the request data in URL-encoded format
    const requestData = qs.stringify({
      'clock.limit': minutes * 60,      // Convert minutes to seconds
      'clock.increment': increment,
      'variant': 'standard',
      'color': 'random',                // Optional: You can set this to 'white', 'black', or 'random'
      'rated': true,                    // Optional: Set to true if the game should be rated
      // Add other parameters as needed based on the API documentation
    });

    console.log('[createLichessGame] Request Data:', requestData);

    // Set the headers for URL-encoded data
    const headers = {
      'Authorization': `Bearer ${process.env.LICHESS_BOT_API_TOKEN}`, // Ensure this token is correct and has necessary permissions
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    console.log('[createLichessGame] Sending POST request to Lichess API...');
    
    // Send the POST request to create the challenge
    const response = await axios.post(challengeUrl, requestData, { headers });

    console.log(`[createLichessGame] Received response with status: ${response.status}`);
    console.log('[createLichessGame] Response Data:', response.data);

    if (response.status === 201 || response.status === 200) { // Some APIs might return 200 for successful creation
      return {
        success: true,
        gameId: response.data.challenge.id, // Adjust based on actual response structure
        gameLink: response.data.challenge.url, // Adjust based on actual response structure
      };
    } else {
      console.error(`[createLichessGame] Unexpected response status: ${response.status}`);
      console.error('[createLichessGame] Response Data:', response.data);
      return { success: false, error: 'Unexpected response status.' };
    }
  } catch (error) {
    if (error.response) {
      // The request was made, and the server responded with a status code outside of the 2xx range
      console.error(`[createLichessGame] API responded with status ${error.response.status}:`, error.response.data);
      return { success: false, error: `API Error: ${error.response.status}` };
    } else if (error.request) {
      // The request was made, but no response was received
      console.error('[createLichessGame] No response received from Lichess API:', error.request);
      return { success: false, error: 'No response from API.' };
    } else {
      // Something else happened while setting up the request
      console.error('[createLichessGame] Error setting up the request:', error.message);
      return { success: false, error: error.message };
    }
  }
};

module.exports = { createLichessGame, getGameOutcome };
