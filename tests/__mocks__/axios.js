// __mocks__/axios.js
module.exports = {
  get: jest.fn((url) => {
    if (url.includes('game123')) {
      return Promise.resolve({ status: 200, data: { gameId: 'game123', status: 'created' } });
    }
    return Promise.reject({ response: { status: 404, data: 'Game not found' } });
  }),
  post: jest.fn(),
};
