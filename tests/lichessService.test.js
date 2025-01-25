
// backend/tests/lichessService.test.js

// Set the environment variable before importing the service
process.env.LICHESS_OAUTH_TOKEN = 'test-token'; // Dummy token for testing

const axios = require('axios');
const { createLichessGame } = require('../services/lichessService');

jest.mock('axios'); // Mock axios

describe('createLichessGame', () => {
  afterEach(() => {
    jest.clearAllMocks(); // Clear mocks after each test
  });

  it('should successfully create a Lichess game and return gameId and gameLink', async () => {
    // Arrange: Define the mock response for the axios.post call
    const mockResponse = {
      status: 201, // Assuming 201 Created
      data: {
        id: 'lichessGame123',
        url: 'https://lichess.org/lichessGame123',
        // Add other necessary fields if your application uses them
      },
    };

    axios.post.mockResolvedValueOnce(mockResponse); // Mock the successful challenge creation

    // Create a mock function for getUsernameFromAccessToken
    const mockGetUsernameFromAccessToken = jest.fn(async (token) => {
      if (token === 'creatorAccessToken') return 'creatorUsername';
      if (token === 'opponentAccessToken') return 'opponentUsername';
      return null;
    });

    // Act: Call the function with correct parameters
    const result = await createLichessGame(
      '5|3', // timeControl
      'standard', // variant
      'creatorAccessToken', // creatorAccessToken
      'opponentAccessToken', // opponentAccessToken
      mockGetUsernameFromAccessToken // getUsernameFromAccessToken
    );

    // Assert: Verify the function returns expected values
    expect(result).toEqual({
      success: true,
      gameId: 'lichessGame123',
      gameLink: 'https://lichess.org/lichessGame123',
    });

    // Prepare the expected parameters as an object
    const expectedParams = {
      variant: 'standard',
      rated: false,
      clock: {
        limit: 300, // 5 minutes * 60 seconds
        increment: 3,
      },
      color: 'random',
      // Removed 'name', 'rules', 'timeControl' as they are not in the service
    };

    // Verify that axios.post was called with correct URL and data
    expect(axios.post).toHaveBeenCalledWith(
      'https://lichess.org/api/challenge/opponentUsername',
      expectedParams, // Updated expectation without the missing fields
      {
        headers: {
          'Authorization': `Bearer creatorAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify the mock function was called with correct tokens
    expect(mockGetUsernameFromAccessToken).toHaveBeenCalledWith('creatorAccessToken');
    expect(mockGetUsernameFromAccessToken).toHaveBeenCalledWith('opponentAccessToken');
  });

  it('should handle API errors gracefully', async () => {
    // Arrange: Mock axios.post to reject with an error
    const mockError = new Error('API Error');
    mockError.response = {
      status: 400,
      data: {
        error: 'Bad Request',
      },
    };
    axios.post.mockRejectedValueOnce(mockError); // Mock the failing challenge creation

    // Create a mock function for getUsernameFromAccessToken
    const mockGetUsernameFromAccessToken = jest.fn(async (token) => {
      if (token === 'creatorAccessToken') return 'creatorUsername';
      if (token === 'opponentAccessToken') return 'opponentUsername';
      return null;
    });

    // Act: Call the function with correct parameters
    const result = await createLichessGame(
      '5|3', // timeControl
      'standard', // variant
      'creatorAccessToken', // creatorAccessToken
      'opponentAccessToken', // opponentAccessToken
      mockGetUsernameFromAccessToken // getUsernameFromAccessToken
    );

    // Assert: Function should return { success: false, error: "API Error" }
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Challenge request failed, status: 400, message: {"error":"Bad Request"}',
      })
    );

    // Verify that axios.post was called with correct parameters
    expect(axios.post).toHaveBeenCalledWith(
      'https://lichess.org/api/challenge/opponentUsername',
      {
        variant: 'standard',
        rated: false,
        clock: {
          limit: 300,
          increment: 3,
        },
        color: 'random',
        // Removed 'name', 'rules', 'timeControl' as they are not in the service
      },
      {
        headers: {
          'Authorization': `Bearer creatorAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify the mock function was called with correct tokens
    expect(mockGetUsernameFromAccessToken).toHaveBeenCalledWith('creatorAccessToken');
    expect(mockGetUsernameFromAccessToken).toHaveBeenCalledWith('opponentAccessToken');
  });

  it('should handle unexpected response statuses', async () => {
    // Arrange: Mock axios.post to reject with an error
    const mockError = new Error('Challenge request failed, status: 400');
    mockError.response = {
      status: 400,
      data: {
        error: 'Bad Request',
      },
    };
    axios.post.mockRejectedValueOnce(mockError); // Mock the failing challenge creation

    // Create a mock function for getUsernameFromAccessToken
    const mockGetUsernameFromAccessToken = jest.fn(async (token) => {
      if (token === 'creatorAccessToken') return 'creatorUsername';
      if (token === 'opponentAccessToken') return 'opponentUsername';
      return null;
    });

    // Act: Call the function with correct parameters
    const result = await createLichessGame(
      '5|3', // timeControl
      'standard', // variant
      'creatorAccessToken', // creatorAccessToken
      'opponentAccessToken', // opponentAccessToken
      mockGetUsernameFromAccessToken // getUsernameFromAccessToken
    );

    // Assert: Function should return { success: false, error: "Challenge request failed, status: 400" }
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Challenge request failed, status: 400, message: {"error":"Bad Request"}',
      })
    );

    // Verify that axios.post was called with correct parameters
    expect(axios.post).toHaveBeenCalledWith(
      'https://lichess.org/api/challenge/opponentUsername',
      {
        variant: 'standard',
        rated: false,
        clock: {
          limit: 300,
          increment: 3,
        },
        color: 'random',
        // Removed 'name', 'rules', 'timeControl' as they are not in the service
      },
      {
        headers: {
          'Authorization': `Bearer creatorAccessToken`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify the mock function was called with correct tokens
    expect(mockGetUsernameFromAccessToken).toHaveBeenCalledWith('creatorAccessToken');
    expect(mockGetUsernameFromAccessToken).toHaveBeenCalledWith('opponentAccessToken');
  });
});

