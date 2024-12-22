// backend/tests/lichessService.test.js
const { getGameOutcome } = require('../services/lichessService');
const axios = require('axios');

jest.mock('axios');

describe('Lichess Service - getGameOutcome', () => {
  it('should return the correct outcome for a valid game', async () => {
    axios.get.mockResolvedValue({
      data: {
        winner: 'white',
        players: {
          white: { user: { name: 'WhitePlayer' } },
          black: { user: { name: 'BlackPlayer' } },
        },
        status: 'mate',
      },
    });

    const result = await getGameOutcome('game123');

    expect(result).toEqual({
      success: true,
      outcome: 'white',
      white: 'WhitePlayer',
      black: 'BlackPlayer',
      status: 'mate',
    });

    // Ensure console.error was not called
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    axios.get.mockRejectedValue(new Error('Network Error'));

    const result = await getGameOutcome('game123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network Error');

    // Ensure console.error was called with the correct message
    expect(console.error).toHaveBeenCalledWith(
      `Error fetching game outcome for Game ID game123:`,
      'Network Error'
    );
  });

  it('should handle invalid game data', async () => {
    axios.get.mockResolvedValue({ data: {} }); // Missing players and winner

    const result = await getGameOutcome('game123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid game data received from Lichess.');

    // Ensure console.error was called with the correct message
    expect(console.error).toHaveBeenCalledWith(
      `Error fetching game outcome for Game ID game123:`,
      'Invalid game data received from Lichess.'
    );
  });
});
