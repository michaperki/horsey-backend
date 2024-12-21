// backend/tests/lichessController.test.js

jest.mock('axios'); // Mock axios before importing
jest.mock('../services/emailService'); // Mock emailService
jest.mock('../services/tokenService'); // Mock tokenService

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

    // Create a pending bet for this test
    await Bet.create({
      userId: user._id,
      gameId,
      choice: 'white',
      amount: 100,
      status: 'pending',
    });

    // Mock axios.get to return a successful game outcome for 'game123-winner'
    axios.get.mockResolvedValueOnce({
      data: {
        winner: 'white',
        players: {
          white: { user: { name: 'WhitePlayer' } },
          black: { user: { name: 'BlackPlayer' } },
        },
        status: 'mate',
      },
    });

    // Mock the tokenService to simulate successful minting
    tokenService.mintTokens.mockResolvedValueOnce({ success: true, txHash: '0xabc' });
    // Mock the sendEmail function to simulate successful email sending
    emailService.sendEmail.mockResolvedValueOnce({ success: true });

    const response = await request(app)
      .post('/lichess/validate-result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('message', `Processed bets for game ${gameId}`);
    expect(response.body).toHaveProperty('outcome', 'white');

    const bet = await Bet.findOne({ gameId, userId: user._id });
    expect(bet.status).toBe('won');
    expect(tokenService.mintTokens).toHaveBeenCalledWith(user._id, 10);
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      user.email,
      'Bet Won!',
      `Congratulations ${user.username}! You won 10 PTK on game ${gameId}.`
    );

    // Assert that console.error was not called
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should handle invalid game IDs gracefully', async () => {
    const invalidGameId = 'invalidGame';

    // Mock axios.get to simulate a failed API call for an invalid game ID
    axios.get.mockRejectedValueOnce({
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

  it('should return 404 if no pending bets found', async () => {
    const gameId = 'game456-no-bets';

    // Ensure no bets exist for this gameId
    // No need to create any bets

    // Mock axios.get to return a successful game outcome for 'game456-no-bets'
    axios.get.mockResolvedValueOnce({
      data: {
        winner: 'black',
        players: {
          white: { user: { name: 'WhitePlayer' } },
          black: { user: { name: 'BlackPlayer' } },
        },
        status: 'resign',
      },
    });

    const response = await request(app)
      .post('/lichess/validate-result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId });

    expect(response.statusCode).toBe(404);
    expect(response.body).toHaveProperty('error', 'No pending bets found for this game');

    // Assert that console.error was not called
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should handle token minting failure', async () => {
    const gameId = 'game789-mint-failure';

    // Create a pending bet for this test
    await Bet.create({
      userId: user._id,
      gameId,
      choice: 'black',
      amount: 50,
      status: 'pending',
    });

    // Mock axios.get to return a successful game outcome for 'game789-mint-failure'
    axios.get.mockResolvedValueOnce({
      data: {
        winner: 'black',
        players: {
          white: { user: { name: 'WhitePlayer' } },
          black: { user: { name: 'BlackPlayer' } },
        },
        status: 'resign',
      },
    });

    // Mock the tokenService to simulate a minting failure
    tokenService.mintTokens.mockResolvedValueOnce({ success: false, error: 'Minting failed' });
    // No need to mock sendEmail here as it should not be called

    const response = await request(app)
      .post('/lichess/validate-result')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gameId });

    expect(response.statusCode).toBe(200); // Still processes
    expect(response.body).toHaveProperty('message', `Processed bets for game ${gameId}`);
    expect(response.body).toHaveProperty('outcome', 'black');

    const bet = await Bet.findOne({ gameId, userId: user._id });
    expect(bet.status).toBe('won'); // Status is updated despite mint failure
    expect(tokenService.mintTokens).toHaveBeenCalledWith(user._id, 10);
    // Ensure that sendEmail was not called due to mint failure
    expect(emailService.sendEmail).not.toHaveBeenCalled();

    // Assert that console.error was called with the correct message
    expect(console.error).toHaveBeenCalledWith(
      `Failed to mint tokens for user ${user._id}: Minting failed`
    );
  });
});
