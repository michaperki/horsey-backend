// tests/tokenRoutes.test.js

// 1. Mock the tokenService module and its functions
jest.mock('../services/tokenService', () => ({
  mintTokens: jest.fn(),
  getBalance: jest.fn(),
  transferTokens: jest.fn(),
}));

// 2. Import dependencies after mocking
const tokenService = require('../services/tokenService');
const request = require('supertest');
const app = require('../server'); // Import the Express app
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('Token Routes', () => {
  let adminToken;

  beforeAll(async () => {
    // Clean up the User collection before tests
    await User.deleteMany({});

    // Create an admin user
    const hashedPassword = await bcrypt.hash('adminpass', 10);
    const admin = await User.create({
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
    });

    // Generate JWT token for admin
    adminToken = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET);
  });

  afterEach(() => {
    // Clear all mock calls after each test
    jest.clearAllMocks();
  });

  it('should mint tokens successfully', async () => {
    // Define what the mock should return when called
    tokenService.mintTokens.mockResolvedValue({ success: true, txHash: '0x123' });

    // Make a POST request to mint tokens
    const res = await request(app)
      .post('/tokens/mint')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        toAddress: '0xRecipientAddress',
        amount: 100,
      });

    // Assertions
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message', 'Tokens minted successfully');
    expect(res.body).toHaveProperty('txHash', '0x123');

    // Ensure that mintTokens was called with correct parameters
    expect(tokenService.mintTokens).toHaveBeenCalledWith('0xRecipientAddress', 100);
  });

  // Add more tests as needed
});
