// backend/tests/setupTests.js
jest.setTimeout(30000); // Increase timeout to 30 seconds
process.env.NODE_ENV = 'test';

require('dotenv').config({ path: '.env.test' });

const { connect, closeDatabase, clearDatabase } = require('./setup');
const { DatabaseError } = require('../utils/errorTypes');

// Initialize global test database
let dbConnection;

/**
 * Setup function to be called before any tests run
 */
const setupTestEnvironment = async () => {
  try {
    // Mock console.error globally
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Connect to the test database
    await connect();
    dbConnection = true;
  } catch (error) {
    console.error('Failed to setup test environment:', error);
    throw new DatabaseError(`Failed to setup test environment: ${error.message}`);
  }
};

/**
 * Cleanup function to be called after each test
 */
const cleanupAfterTest = async () => {
  try {
    // Clear database after each test to ensure test isolation
    if (dbConnection) {
      await clearDatabase();
    }
    
    // Clear all mock calls and instances
    jest.clearAllMocks();
  } catch (error) {
    console.error('Failed to cleanup after test:', error);
    throw new DatabaseError(`Failed to cleanup after test: ${error.message}`);
  }
};

/**
 * Teardown function to be called after all tests
 */
const teardownTestEnvironment = async () => {
  try {
    // Close database connection after all tests
    if (dbConnection) {
      await closeDatabase();
    }
    
    // Restore console.error to its original implementation
    if (console.error.mockRestore) {
      console.error.mockRestore();
    }
  } catch (error) {
    console.error('Failed to teardown test environment:', error);
    throw new DatabaseError(`Failed to teardown test environment: ${error.message}`);
  }
};

// Setup global Jest hooks
beforeAll(setupTestEnvironment);
afterEach(cleanupAfterTest);
afterAll(teardownTestEnvironment);

// Create test utilities for use in other test files
global.testUtils = {
  /**
   * Creates a mock request object for testing middleware and controllers
   * @param {Object} options - Options for the mock request
   * @returns {Object} - Mock request object
   */
  mockRequest: (options = {}) => {
    const {
      body = {},
      params = {},
      query = {},
      headers = {},
      user = null,
      app = { get: jest.fn() },
      id = 'test-request-id'
    } = options;
    
    return { body, params, query, headers, user, app, id };
  },
  
  /**
   * Creates a mock response object for testing middleware and controllers
   * @returns {Object} - Mock response object with jest spies
   */
  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    return res;
  },
  
  /**
   * Creates a mock next function for testing middleware
   * @returns {Function} - Mock next function
   */
  mockNext: () => jest.fn()
};
