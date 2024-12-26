// backend/tests/lichessController.test.js

jest.mock('../services/emailService'); // Mock emailService
jest.mock('../services/tokenService'); // Mock tokenService
jest.mock('../services/lichessService', () => ({
  getGameOutcome: jest.fn(),
}));

// Import the mocked function after jest.mock calls
const { getGameOutcome } = require('../services/lichessService');

const axios = require('axios');
const request = require('supertest');
const app = require('../server'); // Import the Express app
const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const bcrypt = require('bcrypt'); // Import bcrypt
const jwt = require('jsonwebtoken');

// Import the mocked services
const tokenService = require('../services/tokenService');
const emailService = require('../services/emailService');

describe('Lichess Controller - Validate Result', () => {
  let adminToken;
  let admin;
  let user;
  let seekerUser;
  let consoleErrorMock;

  beforeAll(async () => {
    // Connect to the in-memory database if not connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(global.__MONGO_URI__, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    // Create admin user
    admin = await User.create({
      username: 'adminuser',
      email: 'admin@example.com',
      password: await bcrypt.hash('adminpass', 10),
      role: 'admin',
    });

    adminToken = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Create a regular user before each test
    user = await User.create({
      username: 'testuser',
      email: 'testuser@example.com',
      password: await bcrypt.hash('userpass', 10),
    });

    // Create seekerUser
    seekerUser = await User.create({
      username: 'seeker',
      email: 'seeker@example.com',
      password: await bcrypt.hash('seekerpass', 10),
    });

    // Mock console.error before each test
    consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Clear all collections after each test to ensure isolation
    await Bet.deleteMany({});
    await User.deleteMany({});
    jest.resetAllMocks(); // Reset all mocks to ensure no interference between tests
  });

  it('should process winning bets correctly', async () => {
    const gameId = 'game123-winner';
    const betAmount = 100;

    // Create a matched bet for this test
    await Bet.create({
      creatorId: user._id,
      gameId,
      creatorColor: 'white',
      amount: betAmount,
      status: 'matched',
      finalWhiteId: user._id,
      finalBlackId: seekerUser._id,
    });

    // Mock the getGameOutcome to return a successful outcome
    getGameOutcome.mockResolvedValueOnce({
      success: true,
      outcome: 'white',
      status: 'mate',
    });

    // Mock the tokenService and emailService
    tokenService.mintTokens.mockResolvedValueOnce({ success: true, txHash: '0xabc' });
    emailService.sendEmail.mockResolvedValueOnce({ success: true });

    const response = await request(app)
      .post('/lichess/validate-result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('message', `Processed bets for game ${gameId}`);
    expect(response.body).toHaveProperty('outcome', 'white');

    const bet = await Bet.findOne({ gameId, creatorId: user._id });
    expect(bet.status).toBe('won');
    expect(tokenService.mintTokens).toHaveBeenCalledWith(user._id, betAmount);
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      user.email,
      'Bet Won!',
      `Congratulations ${user.username}! You won ${betAmount} PTK on game ${gameId}.`
    );

    // Assert that console.error was not called
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should handle invalid game IDs gracefully', async () => {
    const invalidGameId = 'invalidGame';

    // Mock getGameOutcome to simulate a failed API call for an invalid game ID
    getGameOutcome.mockRejectedValueOnce({
      response: {
        status: 404,
        data: 'Game not found',
      },
      message: 'Request failed with status code 404',
    });

    const response = await request(app)
      .post('/lichess/validate-result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId: invalidGameId });

    expect(response.statusCode).toBe(500);
    expect(response.body).toHaveProperty('error', 'Game not found');

    // Assert that console.error was called with the correct message
    expect(console.error).toHaveBeenCalledWith(
      `Error fetching game outcome for Game ID ${invalidGameId}:`,
      'Request failed with status code 404'
    );
  });

  it('should return 404 if no matched bets found', async () => {
    const gameId = 'game456-no-bets';

    // Ensure no bets exist for this gameId
    // No need to create any bets

    // Mock getGameOutcome to return a successful game outcome for 'game456-no-bets'
    getGameOutcome.mockResolvedValueOnce({
      success: true,
      outcome: 'black',
      status: 'resign',
    });

    const response = await request(app)
      .post('/lichess/validate-result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId });

    expect(response.statusCode).toBe(404);
    expect(response.body).toHaveProperty('error', 'No matched bets found for this game');

    // Assert that console.error was not called
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should handle token minting failure', async () => {
    const gameId = 'game789-mint-failure';
    const betAmount = 50;  // Make amount explicit for clarity

    // Create a matched bet for this test
    await Bet.create({
      creatorId: user._id,
      gameId,
      creatorColor: 'black',
      amount: betAmount,
      status: 'matched',
      finalWhiteId: user._id,
      finalBlackId: user._id,
    });

    getGameOutcome.mockResolvedValueOnce({
      success: true,
      outcome: 'black',
      status: 'resign',
    });

    tokenService.mintTokens.mockResolvedValueOnce({ success: false, error: 'Minting failed' });

    const response = await request(app)
      .post('/lichess/validate-result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('message', `Processed bets for game ${gameId}`);
    expect(response.body).toHaveProperty('outcome', 'black');

    const bet = await Bet.findOne({ gameId, creatorId: user._id });
    expect(bet.status).toBe('won');
    // Update expectation to use actual bet amount
    expect(tokenService.mintTokens).toHaveBeenCalledWith(user._id, betAmount);
    expect(emailService.sendEmail).not.toHaveBeenCalled();

    expect(console.error).toHaveBeenCalledWith(
      `Failed to mint tokens for user ${user._id}: Minting failed`
    );
  });
});
