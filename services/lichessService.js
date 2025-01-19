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
 * @param {string} timeControl - Time control format, e.g., "5|3" for 5 minutes with 3-second increment.
 * @param {string} player1AccessToken - Lichess access token for player 1.
 * @param {string} player2AccessToken - Lichess access token for player 2.
 * @returns {object} Response data from Lichess API or error details.
 */
async function createLichessGame(timeControl, player1AccessToken, player2AccessToken) {
    try {
        console.log('Starting to create Lichess game...');
        console.log('Player 1 Access Token:', player1AccessToken ? 'Provided' : 'Missing');
        console.log('Player 2 Access Token:', player2AccessToken ? 'Provided' : 'Missing');
        console.log('Time Control:', timeControl);

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

        // Prepare challenge data
        const challengeData = {
            variant: 'standard',
            rated: false,
            clock: {
                limit: clockLimit,
                increment: clockIncrement,
            },
            color: 'random',
            opponent: null, // Will be set for each player
        };

        // Create challenge for Player 1 to Player 2
        challengeData.opponent = ''; // Placeholder

        // Since Lichess API requires separate challenges, we'll create two challenges:
        // Player 1 challenges Player 2 and vice versa to ensure both have access.

        // Function to create a challenge
        const createChallenge = async (challengerAccessToken, opponentUsername) => {
            const url = `https://lichess.org/api/challenge/${opponentUsername}`;
            const headers = {
                Authorization: `Bearer ${challengerAccessToken}`,
                'Content-Type': 'application/json',
            };
            const body = JSON.stringify({
                variant: challengeData.variant,
                rated: challengeData.rated,
                clock: challengeData.clock,
                color: challengeData.color,
                timeControl: `${minutes}|${increment}`,
                rules: 'noRematch,noGiveTime,noEarlyDraw',
            });

            console.log(`Creating challenge from ${opponentUsername}...`);

            const response = await axios.post(url, body, { headers });

            console.log(`Challenge created:`, response.data);
            return response.data; // Returns challenge data including id and status
        };

        // Assuming you have access to both players' usernames
        // You'll need to fetch them based on access tokens or pass them as parameters
        // For simplicity, let's assume you can extract usernames from access tokens
        // Alternatively, modify the function to accept usernames as parameters

        // Placeholder: Extract usernames (Implement actual extraction based on your auth system)
        const player1Username = await getUsernameFromAccessToken(player1AccessToken);
        const player2Username = await getUsernameFromAccessToken(player2AccessToken);

        if (!player1Username || !player2Username) {
            throw new Error('Unable to retrieve usernames from access tokens.');
        }

        // Create challenges
        const [challenge1, challenge2] = await Promise.all([
            createChallenge(player1AccessToken, player2Username),
            createChallenge(player2AccessToken, player1Username),
        ]);

        // Construct game link (assuming both challenges are accepted)
        // In reality, you might need to listen for challenge acceptance or use webhooks
        // Here, we'll mock the game link using the challenge ID

        const gameLink = `https://lichess.org/${challenge1.id}`; // Using challenge1.id as gameId placeholder

        return {
            success: true,
            gameId: challenge1.id,
            gameLink,
        };
    } catch (error) {
        console.error('Error creating challenge on Lichess:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message,
        };
    }
}

/**
 * Mock function to get username from access token.
 * Replace this with actual implementation.
 */
async function getUsernameFromAccessToken(accessToken) {
    try {
        const response = await axios.get('https://lichess.org/api/account', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return response.data.username;
    } catch (error) {
        console.error('Error fetching username from Lichess:', error.message);
        return null;
    }
}

module.exports = { createLichessGame, getGameOutcome };
