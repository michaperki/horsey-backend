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
        headers: { 'Authorization': `Bearer ${process.env.LICHESS_TOKEN}` },
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
 * Get the game outcome based on environment and logic.
 * @param {string} gameId - The ID of the game.
 */
const getGameOutcome = async (gameId) => {
    if (process.env.MOCK_LICHESS === 'true') {
        return getMockedGameOutcome();
    }
    return await fetchGameOutcomeFromLichess(gameId);
};

/**
 * Create a Lichess game challenge between two players.
 * @param {string} player1Username - Lichess username for player 1.
 * @param {string} player2Username - Lichess username for player 2.
 * @param {string} timeControl - Time control format, e.g., "300" for 5 minutes.
 * @returns {object} Response data from Lichess API or error details.
 */
async function createLichessGame(timeControl, player1Username, player2Username) {
    try {
        console.log('Starting to create Lichess game...');
        console.log('Player 1:', player1Username, 'Player 2:', player2Username, 'Time Control:', timeControl);

        // Validate timeControl format
        if (!/^\d+\|\d+$/.test(timeControl)) {
            throw new Error(`Invalid timeControl format: ${timeControl}. Expected format: "<minutes>|<increment>", e.g., "5|3".`);
        }

        // Parse "5|3" => clock.limit=300, clock.increment=3
        const [minutes, increment] = timeControl.split('|');
        const clockLimit = parseInt(minutes, 10) * 60; // Convert minutes to seconds
        const clockIncrement = parseInt(increment, 10);

        if (isNaN(clockLimit) || isNaN(clockIncrement)) {
            throw new Error('Failed to parse timeControl values. Ensure it is in the format "<minutes>|<increment>".');
        }

        console.log('Parsed clock values:', { clockLimit, clockIncrement });

        const lichessApiUrl = 'https://lichess.org/api/challenge/open';
        const headers = {
            Authorization: `Bearer ${process.env.LICHESS_OAUTH_TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        };

        const body = qs.stringify({
            variant: 'standard',
            rated: 'false', // Set to 'true' if rated games are needed
            color: 'random',
            'clock.limit': clockLimit,
            'clock.increment': clockIncrement,
            users: `${player1Username},${player2Username}`,
            rules: 'noRematch,noGiveTime,noEarlyDraw',
            name: 'Cheth Game',
        });

        console.log('Sending POST request to Lichess API...');
        const response = await axios.post(lichessApiUrl, body, { headers });

        console.log('Response received:', response.status, response.data);

        if (response.status === 200 || response.status === 201) {
            return {
                success: true,
                challenge: response.data,
            };
        }

        console.warn('Unexpected response status:', response.status);
        return {
            success: false,
            error: `Challenge request failed, status: ${response.status}`,
        };
    } catch (error) {
        console.error('Error creating challenge on Lichess:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message,
        };
    }
}

module.exports = { createLichessGame, getGameOutcome };
