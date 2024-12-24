
// backend/fixtures/lichessMockData.js

const mockedGameOutcome = {
  success: true,
  outcome: 'white',
  white: 'MockedWhitePlayer',
  black: 'MockedBlackPlayer',
  status: 'created', // or 'created', 'mate', etc., depending on your test cases
};

module.exports = { mockedGameOutcome };

