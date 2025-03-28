// backend/tests/__mocks__/axios.js

/**
 * This mock provides simulated responses for axios HTTP requests
 * used throughout the codebase. It allows tests to run without
 * making actual network requests.
 */

// Standard mock implementation for GET requests
const get = jest.fn((url) => {
  console.log(`[Mock Axios] GET request to: ${url}`);
  
  // Lichess game outcomes
  if (url.includes('lichess.org/game/export/')) {
    const gameId = url.split('/').pop().split('?')[0];
    
    if (gameId === 'game123') {
      return Promise.resolve({ 
        status: 200, 
        data: { 
          id: 'game123',
          status: 'mate',
          winner: 'white',
          players: {
            white: { user: { name: 'whitePlayer' } },
            black: { user: { name: 'blackPlayer' } }
          }
        } 
      });
    }
    
    if (gameId === 'ongoing123') {
      return Promise.resolve({ 
        status: 200, 
        data: { 
          id: 'ongoing123',
          status: 'started',
          players: {
            white: { user: { name: 'whitePlayer' } },
            black: { user: { name: 'blackPlayer' } }
          }
        } 
      });
    }
    
    if (gameId === 'draw123') {
      return Promise.resolve({ 
        status: 200, 
        data: { 
          id: 'draw123',
          status: 'draw',
          players: {
            white: { user: { name: 'whitePlayer' } },
            black: { user: { name: 'blackPlayer' } }
          }
        } 
      });
    }
  }
  
  // Lichess account info
  if (url === 'https://lichess.org/api/account') {
    return Promise.resolve({
      status: 200,
      data: {
        id: 'lichess123',
        username: 'testuser',
        perfs: {
          bullet: { rating: 1800, games: 100 },
          blitz: { rating: 1900, games: 200 },
          rapid: { rating: 2000, games: 150 },
          classical: { rating: 2100, games: 50 },
          correspondence: { rating: 2200, games: 20 },
          puzzle: { rating: 2300, games: 500 },
          ultraBullet: { rating: 1700, games: 50 },
          crazyhouse: { rating: 1600, games: 30 },
          chess960: { rating: 1500, games: 10 }
        }
      }
    });
  }
  
  // Default 404 response for unknown URLs
  return Promise.reject({ 
    response: { 
      status: 404, 
      data: `Mock Axios: ${url} not found` 
    } 
  });
});

// Standard mock implementation for POST requests
const post = jest.fn((url, data, config) => {
  console.log(`[Mock Axios] POST request to: ${url}`);
  console.log('[Mock Axios] POST data:', JSON.stringify(data));
  
  // Lichess token endpoint
  if (url === 'https://lichess.org/api/token') {
    return Promise.resolve({
      status: 200,
      data: {
        access_token: 'mock_access_token_123',
        refresh_token: 'mock_refresh_token_456',
        expires_in: 3600
      }
    });
  }
  
  // Lichess challenge endpoint
  if (url.includes('lichess.org/api/challenge/')) {
    const opponent = url.split('/').pop();
    
    return Promise.resolve({
      status: 200,
      data: {
        id: `mockgame_${Date.now()}`,
        url: `https://lichess.org/mockgame_${Date.now()}`,
        status: 'created',
        challenger: { name: 'challenger' },
        destUser: { name: opponent }
      }
    });
  }
  
  // Mock Stripe payment intent creation
  if (url.includes('stripe.com/v1/payment_intents')) {
    return Promise.resolve({
      status: 200,
      data: {
        id: `pi_${Math.random().toString(36).substring(2, 15)}`,
        amount: data.amount,
        currency: data.currency,
        status: 'succeeded'
      }
    });
  }
  
  // Default response for unknown URLs
  return Promise.resolve({
    status: 200,
    data: {
      message: 'Mock success response',
      url,
      receivedData: data
    }
  });
});

// Add other HTTP methods
const put = jest.fn((url, data) => {
  console.log(`[Mock Axios] PUT request to: ${url}`);
  return Promise.resolve({
    status: 200,
    data: { success: true }
  });
});

const patch = jest.fn((url, data) => {
  console.log(`[Mock Axios] PATCH request to: ${url}`);
  return Promise.resolve({
    status: 200,
    data: { success: true }
  });
});

const del = jest.fn((url) => {
  console.log(`[Mock Axios] DELETE request to: ${url}`);
  return Promise.resolve({
    status: 200,
    data: { success: true }
  });
});

// Export the mock functions
module.exports = {
  get,
  post,
  put,
  patch,
  delete: del,
  // Additional helper methods for tests
  mockClear: () => {
    get.mockClear();
    post.mockClear();
    put.mockClear();
    patch.mockClear();
    del.mockClear();
  },
  mockReset: () => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
    patch.mockReset();
    del.mockReset();
  }
};
