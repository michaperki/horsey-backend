// Update services/lichessService.js
const axios = require('axios');
const qs = require('qs');
const config = require('../config');
const { mockedGameOutcome, mockedCreateGameResponse } = require('../fixtures/lichessMockData');
const logger = require('../utils/logger');

/**
 * Returns a mocked Lichess game outcome.
 */
const getMockedGameOutcome = () => {
  logger.info('MOCK_LICHESS is enabled. Returning mocked game outcome.');
  return mockedGameOutcome;
};

/**
 * Fetches the actual game outcome from Lichess API.
 * @param {string} gameId - The ID of the game.
 */
const fetchGameOutcomeFromLichess = async (gameId) => {
  const url = `https://lichess.org/game/export/${gameId}?pgnInJson=true`;
  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${process.env.LICHESS_OAUTH_TOKEN}` },
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
 * Creates a Lichess game challenge from the creator to the opponent.
 * @param {string} timeControl - Format "minutes|increment" (e.g., "5|3")
 * @param {string} variant - Game variant (e.g., "standard", "crazyhouse")
 * @param {string} creatorAccessToken - OAuth access token for the creator
 * @param {string} opponentAccessToken - OAuth access token for the opponent
 * @param {Function} getUsernameFromAccessToken - Function to retrieve username from access token
 * @returns {object} - { success: boolean, gameId: string, gameLink: string, error?: string }
 */
const createLichessGame = async (timeControl, variant, creatorAccessToken, opponentAccessToken, getUsernameFromAccessToken) => {
  if (process.env.MOCK_LICHESS === 'true') {
    logger.info('MOCK_LICHESS is enabled. Returning mocked game creation response.');
    const userId = await getUsernameFromAccessToken(creatorAccessToken);
    return mockedCreateGameResponse(userId);
  }

  try {
    logger.info('Starting to create Lichess game...', { timeControl, variant });
    // Retrieve usernames
    const creatorUsername = await getUsernameFromAccessToken(creatorAccessToken);
    const opponentUsername = await getUsernameFromAccessToken(opponentAccessToken);

    logger.info('Retrieved usernames', { creatorUsername, opponentUsername });

    const [minutes, increment] = timeControl.split('|');
    const clockLimit = parseInt(minutes, 10) * 60;
    const clockIncrement = parseInt(increment, 10);

    const challengeData = {
      variant: variant,
      rated: false,
      clock: {
        limit: clockLimit,
        increment: clockIncrement,
      },
      color: 'random',
    };

    logger.debug('Challenge Payload', { challengeData });

    const challengeUrl = `https://lichess.org/api/challenge/${opponentUsername}`;
    const response = await axios.post(challengeUrl, challengeData, {
      headers: {
        'Authorization': `Bearer ${creatorAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    logger.debug('Challenge response received', { status: response.status, data: response.data });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Failed to create challenge. Status Code: ${response.status}`);
    }

    const challenge = response.data;
    return {
      success: true,
      gameId: challenge.id,
      gameLink: `https://lichess.org/${challenge.id}`,
    };
  } catch (error) {
    const errorMessage = error.response
      ? `Challenge request failed, status: ${error.response.status}, message: ${JSON.stringify(error.response.data)}`
      : error.message;
    logger.error('Error creating challenge on Lichess', { error: errorMessage, stack: error.stack });
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Fetches the outcome of a game from Lichess API or returns a mocked outcome.
 * @param {string} gameId - The ID of the game.
 * @returns {object} - { success: boolean, outcome: 'white' | 'black' | 'draw', whiteUsername: string, blackUsername: string, error?: string }
 */
const getGameOutcome = async (gameId) => {
  logger.debug(`Starting getGameOutcome for Game ID: ${gameId}`);

  if (process.env.MOCK_LICHESS === 'true') {
    logger.info('MOCK_LICHESS is enabled. Returning mocked game outcome.');
    return getMockedGameOutcome();
  }

  try {
    const url = `https://lichess.org/game/export/${gameId}?pgnInJson=true`;
    logger.debug(`Fetching data from Lichess API`, { url });

    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.LICHESS_OAUTH_TOKEN}`,
      },
    });

    logger.debug('Received response from Lichess API', { status: response.status, statusText: response.statusText });

    const gameData = response.data;
    logger.debug('Game data received', { gameData });

    if (!gameData || !gameData.players) {
      logger.warn('Invalid game data structure', { gameData });
      throw new Error('Invalid game data received from Lichess.');
    }

    const { winner, status, termination } = gameData;
    logger.debug('Game status details', { status, winner, termination });

    let outcome;
    if (status === 'draw') {
      outcome = 'draw';
    } else if (status === 'mate' && winner === 'white') {
      outcome = 'white';
    } else if (status === 'mate' && winner === 'black') {
      outcome = 'black';
    } else if (status === 'resign') {
      outcome = winner; // 'white' or 'black'
    } else if (status === 'timeout') {
      outcome = winner; // 'white' or 'black'
    } else if (status === 'aborted') {
      logger.warn('Game was aborted.', { gameId });
      return { success: false, error: 'Game was aborted.' };
    } else {
      logger.warn('Unexpected game status or ongoing game', { status });
      return { success: false, error: 'Game is still ongoing or has an unexpected status.' };
    }

    const whiteUsername = gameData.players.white.user.name;
    const blackUsername = gameData.players.black.user.name;

    logger.debug('Game outcome determined', { outcome, whiteUsername, blackUsername });

    return {
      success: true,
      outcome,
      whiteUsername,
      blackUsername,
    };
  } catch (error) {
    logger.error(`Error fetching game outcome for Game ID ${gameId}`, { error: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
};

/**
 * Retrieves the username associated with a Lichess access token.
 * @param {string} accessToken - Lichess OAuth access token.
 * @returns {string|null} - Username or null if failed.
 */
const getUsernameFromAccessToken = async (accessToken) => {
  if (process.env.MOCK_LICHESS === 'true') {
    logger.info('MOCK_LICHESS is enabled. Returning mocked username.');
    return `mockUser_${accessToken.substring(0, 5)}`;
  }

  try {
    const response = await axios.get('https://lichess.org/api/account', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    return response.data.username;
  } catch (error) {
    logger.error('Error fetching username from Lichess', { error: error.response?.data || error.message, stack: error.stack });
    return null;
  }
};

module.exports = { createLichessGame, getGameOutcome, getUsernameFromAccessToken };

