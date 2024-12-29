
// backend/tests/lichessService.test.js

const axios = require('axios');
const qs = require('qs');
const { createLichessGame } = require('../services/lichessService');

jest.mock('axios');

describe('createLichessGame', () => {
  afterEach(() => {
    jest.clearAllMocks(); // Clear mocks after each test
  });

  it('should successfully create a Lichess game and return gameId and gameLink', async () => {
    // Arrange: Define the mock response
    const mockResponse = {
      status: 201, // Assuming 201 Created
      data: {
        challenge: {
          id: 'lichessGame123',
          url: 'https://lichess.org/lichessGame123',
        },
      },
    };

    axios.post.mockResolvedValue(mockResponse);

    // Act: Call the function with test data
    const result = await createLichessGame('5|3', 'michaperki', 'cheth_testing');

    // Assert: Verify the function returns expected values
    expect(result).toEqual({
      success: true,
      gameId: 'lichessGame123',
      gameLink: 'https://lichess.org/lichessGame123',
    });

    // Prepare the expected URL-encoded data
    const expectedRequestData = qs.stringify({
      'clock.limit': 300, // 5 minutes * 60 seconds
      'clock.increment': 3,
      'variant': 'standard',
      'color': 'random',
      'rated': true,
    });

    // Optionally, verify Axios was called with correct parameters
    expect(axios.post).toHaveBeenCalledWith(
      'https://lichess.org/api/challenge/cheth_testing',
      expectedRequestData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LICHESS_BOT_API_TOKEN}`,
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
        error: 'API Error', // Adjust based on the actual error message
      })
    );

    // Optionally, verify Axios was called
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

    // Assert: Function should return { success: false, error: "Unexpected response status." }
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Unexpected response status.',
      })
    );

    // Optionally, verify Axios was called
    expect(axios.post).toHaveBeenCalled();
  });
});

