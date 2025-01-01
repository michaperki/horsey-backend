
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
    // Arrange: Define the corrected mock response
    const mockResponse = {
      status: 201, // Assuming 201 Created
      data: {
        id: 'lichessGame123',
        url: 'https://lichess.org/lichessGame123',
        // Add other necessary fields if your application uses them
      },
    };

    axios.post.mockResolvedValue(mockResponse);

    // Act: Call the function with test data
    const result = await createLichessGame('5|3', 'michaperki', 'cheth_testing');

    // Assert: Verify the function returns expected values
    expect(result).toEqual({
      success: true,
      challenge: {
        id: 'lichessGame123',
        url: 'https://lichess.org/lichessGame123',
      },
    });

    // Prepare the expected parameters as an object
    const expectedParams = {
      variant: 'standard',
      rated: 'false',
      color: 'random',
      'clock.limit': '300', // qs.stringify converts numbers to strings
      'clock.increment': '3',
      users: 'michaperki,cheth_testing',
      rules: 'noRematch,noGiveTime,noEarlyDraw',
      name: 'Cheth Game',
    };

    // Capture the actual request body passed to axios.post
    const actualRequestBody = axios.post.mock.calls[0][1];
    const actualParams = qs.parse(actualRequestBody);

    // Verify that all expected parameters are present
    expect(actualParams).toEqual(expectedParams);

    // Verify Axios was called with correct URL and headers
    expect(axios.post).toHaveBeenCalledWith(
      'https://lichess.org/api/challenge/open',
      expect.any(String), // We've already checked the body above
      {
        headers: {
          'Authorization': `Bearer ${process.env.LICHESS_OAUTH_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
  });

  it('should handle API errors gracefully', async () => {
    // Arrange: Mock Axios to reject with an error
    axios.post.mockRejectedValue(new Error('API Error'));

    // Act: Call the function
    const result = await createLichessGame('5|3', 'michaperki', 'cheth_testing');

    // Assert: Function should return { success: false, error: "API Error" }
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'API Error', // This should match the error message thrown
      })
    );

    // Verify Axios was called
    expect(axios.post).toHaveBeenCalled();
  });

  it('should handle unexpected response statuses', async () => {
    // Arrange: Mock Axios to return a non-201 status
    const mockResponse = {
      status: 400, // Bad Request
      data: {},
    };

    axios.post.mockResolvedValue(mockResponse);

    // Act: Call the function
    const result = await createLichessGame('5|3', 'michaperki', 'cheth_testing');

    // Assert: Function should return { success: false, error: "Challenge request failed, status: 400" }
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Challenge request failed, status: 400',
      })
    );

    // Verify Axios was called
    expect(axios.post).toHaveBeenCalled();
  });
});

