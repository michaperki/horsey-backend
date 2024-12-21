// backend/jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
  modulePathIgnorePatterns: ['<rootDir>/tests/__mocks__'], // Ensure mocks are not treated as modules
  collectCoverage: true,
  collectCoverageFrom: [
    "controllers/**/*.js",
    "routes/**/*.js",
    "middleware/**/*.js",
    "models/**/*.js",
    "services/**/*.js",
  ],
  coverageReporters: ["json", "lcov", "text", "clover"],
};
