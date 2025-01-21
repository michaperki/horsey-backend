
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
 * @param {string} opponentUsername - Lichess username of the opponent
 * @returns {object} - { success: boolean, gameId: string, gameLink: string, error?: string }
 */
const createLichessGame = async (timeControl, variant, creatorAccessToken, opponentAccessToken, getUsernameFromAccessToken) => {
    try {
        console.log('Starting to create Lichess game...');
        console.log('Time Control:', timeControl);
        console.log('Variant:', variant);

        // Retrieve usernames
        const creatorUsername = await getUsernameFromAccessToken(creatorAccessToken);
        const opponentUsername = await getUsernameFromAccessToken(opponentAccessToken);

        console.log('Creator Username:', creatorUsername);
        console.log('Opponent Username:', opponentUsername);

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

        console.log('Challenge Payload:', challengeData);

        const challengeUrl = `https://lichess.org/api/challenge/${opponentUsername}`;
        const response = await axios.post(challengeUrl, challengeData, {
            headers: {
                'Authorization': `Bearer ${creatorAccessToken}`,
                'Content-Type': 'application/json',
            },
        });

        console.log('Response Status:', response.status);
        console.log('Response Body:', response.data);

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
        console.error('Error creating challenge on Lichess:', errorMessage);
        return {
            success: false,
            error: errorMessage,
        };
    }
};

/**
 * Fetches the outcome of a game from Lichess API.
 * @param {string} gameId - The ID of the game.
 * @returns {object} - { success: boolean, outcome: 'white' | 'black' | 'draw', error?: string }
 */
const getGameOutcome = async (gameId) => {
    try {
        const url = `https://lichess.org/game/export/${gameId}?pgnInJson=true`;
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/json',
                // 'Authorization': `Bearer YOUR_ACCESS_TOKEN`, // Not required for public games
            },
        });

        const gameData = response.data;

        if (!gameData || !gameData.players) {
            throw new Error('Invalid game data received from Lichess.');
        }

        const { winner, status } = gameData;

        if (status === 'draw') {
            return { success: true, outcome: 'draw' };
        } else if (winner === 'white') {
            return { success: true, outcome: 'white' };
        } else if (winner === 'black') {
            return { success: true, outcome: 'black' };
        } else {
            // Game is still ongoing or an unexpected status
            return { success: false, error: 'Game is still ongoing or has an unexpected status.' };
        }
    } catch (error) {
        console.error(`Error fetching game outcome for Game ID ${gameId}:`, error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Retrieves the username associated with a Lichess access token.
 * @param {string} accessToken - Lichess OAuth access token.
 * @returns {string|null} - Username or null if failed.
 */
const getUsernameFromAccessToken = async (accessToken) => {
    try {
        const response = await axios.get('https://lichess.org/api/account', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        return response.data.username;
    } catch (error) {
        console.error('Error fetching username from Lichess:', error.response?.data || error.message);
        return null;
    }
};

module.exports = { createLichessGame, getGameOutcome, getUsernameFromAccessToken };
