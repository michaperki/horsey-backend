// backend/tests/setupTests.js
jest.setTimeout(30000); // Increase timeout to 30 seconds
process.env.NODE_ENV = 'test';

require('dotenv').config({ path: '.env.test' });

const { connect, closeDatabase, clearDatabase } = require('./setup');

// Mock console.error globally before any tests run
beforeAll(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await connect();
});

// Clear database after each test to ensure test isolation
afterEach(async () => {
  await clearDatabase();
  jest.clearAllMocks(); // Clear all mock calls and instances
});

// Close database connection after all tests
afterAll(async () => {
  await closeDatabase();

  // Restore console.error to its original implementation
  if (console.error.mockRestore) {
    console.error.mockRestore();
  }
});
