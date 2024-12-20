
// backend/tests/setupTests.js
jest.setTimeout(30000); // Increase timeout to 30 seconds to accommodate longer teardown processes

// Set NODE_ENV to 'test' before anything else
process.env.NODE_ENV = 'test';

const { connect, closeDatabase, clearDatabase } = require('./setup');

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeDatabase();
});
