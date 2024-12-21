
// backend/tests/setupTests.js
jest.setTimeout(30000); // Increase timeout to 30 seconds
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { connect, closeDatabase, clearDatabase } = require('./setup');

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await connect();
  }
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeDatabase();
});
