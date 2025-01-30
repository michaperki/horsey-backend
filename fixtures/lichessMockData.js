
// backend/fixtures/lichessMockData.js

const mockedGameOutcome = {
    success: true,
    outcome: 'white', // or 'black' or 'draw'
    white: 'mockChallenger',
    black: 'mockOpponent',
    status: 'concluded',
};

const mockedCreateGameResponse = (userId) => ({
    success: true,
    gameId: `mockGame_${userId}_${Date.now()}`,
    gameLink: `https://lichess.org/mockGame_${userId}_${Date.now()}`,
});

module.exports = {
    mockedGameOutcome,
    mockedCreateGameResponse,
};

