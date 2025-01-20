
// backend/tests/lichessService.test.js

// Set the environment variable before importing the service
process.env.LICHESS_OAUTH_TOKEN = 'test-token'; // Dummy token for testing

const axios = require('axios');
const qs = require('qs');
const { createLichessGame } = require('../services/lichessService');

jest.mock('axios');

describe('createLichessGame', () => {
  afterEach(() => {
    jest.clearAllMocks(); // Clear mocks after each test
  });

  it('should successfully create a Lichess game and return gameId and gameLink', async () => {
    // Arrange: Define the corrected mock responses for two axios.post calls
    const mockResponse1 = {
      status: 201, // Assuming 201 Created
      data: {
        id: 'lichessGame123',
        url: 'https://lichess.org/lichessGame123',
        // Add other necessary fields if your application uses them
      },
    };

    const mockResponse2 = {
      status: 201,
      data: {
        id: 'lichessGame456',
        url: 'https://lichess.org/lichessGame456',
      },
    };

    axios.post
      .mockResolvedValueOnce(mockResponse1) // For the first challenge
      .mockResolvedValueOnce(mockResponse2); // For the second challenge

    // Create a mock function for getUsernameFromAccessToken
    const mockGetUsernameFromAccessToken = jest.fn(async (token) => {
      if (token === 'creatorAccessToken') return 'creatorUsername';
      if (token === 'opponentAccessToken') return 'opponentUsername';
      return null;
    });

    // Act: Call the function with test data and the mock function
    const result = await createLichessGame('5|3', 'creatorAccessToken', 'opponentAccessToken', mockGetUsernameFromAccessToken);

    // Assert: Verify the function returns expected values
    expect(result).toEqual({
      success: true,
      gameId: 'lichessGame123',
      gameLink: 'https://lichess.org/lichessGame123',
    });

    // Prepare the expected parameters as an object
    const expectedParams1 = {
      variant: 'standard',
      rated: false,
      clock: {
        limit: 300,
        increment: 3,
      },
      color: 'random',
      timeControl: '5|3',
      rules: 'noRematch,noGiveTime,noEarlyDraw',
      name: 'Cheth Game',
    };

    const expectedParams2 = {
      variant: 'standard',
      rated: false,
      clock: {
        limit: 300,
        increment: 3,
      },
      color: 'random',
      timeControl: '5|3',
      rules: 'noRematch,noGiveTime,noEarlyDraw',
      name: 'Cheth Game',
    };

    // Capture the actual request body passed to axios.post calls
    const actualRequestBody1 = axios.post.mock.calls[0][1];
    const actualParams1Received = JSON.parse(actualRequestBody1);

    const actualRequestBody2 = axios.post.mock.calls[1][1];
    const actualParams2Received = JSON.parse(actualRequestBody2);

    // Verify that all expected parameters are present for the first challenge
    expect(actualParams1Received).toEqual(expectedParams1);

    // Verify that all expected parameters are present for the second challenge
    expect(actualParams2Received).toEqual(expectedParams2);

    // Verify Axios was called with correct URL and headers for the first challenge
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      'https://lichess.org/api/challenge/opponentUsername',
      JSON.stringify(expectedParams1),
      {
        headers: {
          'Authorization': `Bearer creatorAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify Axios was called with correct URL and headers for the second challenge
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'https://lichess.org/api/challenge/creatorUsername',
      JSON.stringify(expectedParams2),
      {
        headers: {
          'Authorization': `Bearer opponentAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('should handle API errors gracefully', async () => {
    // Arrange: Mock Axios to reject with an error on the first call
    axios.post
      .mockRejectedValueOnce(new Error('API Error')) // First challenge fails
      .mockResolvedValueOnce({
        status: 201,
        data: {
          id: 'lichessGame456',
          url: 'https://lichess.org/lichessGame456',
        },
      }); // Second challenge succeeds

    // Create a mock function for getUsernameFromAccessToken
    const mockGetUsernameFromAccessToken = jest.fn(async (token) => {
      if (token === 'creatorAccessToken') return 'creatorUsername';
      if (token === 'opponentAccessToken') return 'opponentUsername';
      return null;
    });

    // Act: Call the function
    const result = await createLichessGame('5|3', 'creatorAccessToken', 'opponentAccessToken', mockGetUsernameFromAccessToken);

    // Assert: Function should return { success: false, error: "API Error" }
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'API Error', // This should match the error message thrown
      })
    );

    // Verify Axios was called twice
    expect(axios.post).toHaveBeenCalledTimes(2);

    // Optionally, verify the first call threw an error
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      'https://lichess.org/api/challenge/opponentUsername',
      JSON.stringify({
        variant: 'standard',
        rated: false,
        clock: {
          limit: 300,
          increment: 3,
        },
        color: 'random',
        timeControl: '5|3',
        rules: 'noRematch,noGiveTime,noEarlyDraw',
        name: 'Cheth Game',
      }),
      {
        headers: {
          'Authorization': `Bearer creatorAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify the second call was made despite the first failing (depending on implementation)
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'https://lichess.org/api/challenge/creatorUsername',
      JSON.stringify({
        variant: 'standard',
        rated: false,
        clock: {
          limit: 300,
          increment: 3,
        },
        color: 'random',
        timeControl: '5|3',
        rules: 'noRematch,noGiveTime,noEarlyDraw',
        name: 'Cheth Game',
      }),
      {
        headers: {
          'Authorization': `Bearer opponentAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('should handle unexpected response statuses', async () => {
    // Arrange: Mock Axios to reject with an error on the first call
    const error = new Error('Challenge request failed, status: 400');
    error.response = {
      status: 400,
      data: {
        error: 'Bad Request',
      },
    };
    axios.post
      .mockRejectedValueOnce(error) // First challenge fails
      .mockResolvedValueOnce({
        status: 201,
        data: {
          id: 'lichessGame456',
          url: 'https://lichess.org/lichessGame456',
        },
      }); // Second challenge succeeds

    // Create a mock function for getUsernameFromAccessToken
    const mockGetUsernameFromAccessToken = jest.fn(async (token) => {
      if (token === 'creatorAccessToken') return 'creatorUsername';
      if (token === 'opponentAccessToken') return 'opponentUsername';
      return null;
    });

    // Act: Call the function
    const result = await createLichessGame(
      '5|3',
      'creatorAccessToken',
      'opponentAccessToken',
      mockGetUsernameFromAccessToken
    );

    // Assert: Function should return { success: false, error: "Challenge request failed, status: 400" }
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Challenge request failed, status: 400',
      })
    );

    // Verify Axios was called twice
    expect(axios.post).toHaveBeenCalledTimes(2);

    // Verify the first call threw an error
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      'https://lichess.org/api/challenge/opponentUsername',
      JSON.stringify({
        variant: 'standard',
        rated: false,
        clock: {
          limit: 300,
          increment: 3,
        },
        color: 'random',
        timeControl: '5|3',
        rules: 'noRematch,noGiveTime,noEarlyDraw',
        name: 'Cheth Game',
      }),
      {
        headers: {
          Authorization: `Bearer creatorAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify the second call was made despite the first failing (depending on implementation)
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'https://lichess.org/api/challenge/creatorUsername',
      JSON.stringify({
        variant: 'standard',
        rated: false,
        clock: {
          limit: 300,
          increment: 3,
        },
        color: 'random',
        timeControl: '5|3',
        rules: 'noRematch,noGiveTime,noEarlyDraw',
        name: 'Cheth Game',
      }),
      {
        headers: {
          Authorization: `Bearer opponentAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );
  });
});

