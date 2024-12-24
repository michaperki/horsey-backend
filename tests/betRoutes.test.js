
// backend/tests/betRoutes.test.js
jest.mock('../services/lichessService'); // Mock lichessService
jest.mock('../services/emailService'); // Uses __mocks__/emailService.js

const request = require('supertest');
const app = require('../server'); // Import the Express app
const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock the lichessService
const { getGameOutcome } = require('../services/lichessService');

// Mock the email service
const emailService = require('../services/emailService');

describe('POST /bets/place', () => {
  let userToken;
  let userPayload; // Define userPayload in the outer scope

  beforeAll(async () => {
    // Connect to the in-memory MongoDB instance if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    // Create a user and obtain a token
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await User.create({
      username: 'betuser',
      email: 'betuser@example.com',
      password: hashedPassword,
    });

    userPayload = {
      id: user._id, // Already an ObjectId
      username: user.username,
      role: user.role,
    };

    userToken = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Mock the getGameOutcome function for 'game123'
    getGameOutcome.mockImplementation(async (gameId) => {
      if (gameId === 'game123') {
        return {
          success: true,
          outcome: 'white',
          white: 'MockedWhitePlayer',
          black: 'MockedBlackPlayer',
          status: 'created', // Allow betting
        };
      }
      // Simulate a failure for other gameIds
      return {
        success: false,
        error: 'Game not found',
      };
    });
  });

  afterEach(async () => {
    await Bet.deleteMany({});
    jest.clearAllMocks(); // Clear mock calls after each test
  });

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  it('should place a new bet for an authenticated user', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game123',
        choice: 'white',
        amount: 50,
      });

    console.log(res.body);

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('message', 'Bet placed successfully');
    expect(res.body.bet).toHaveProperty('gameId', 'game123');

    // Verify bet is in the database
    const bet = await Bet.findOne({ gameId: 'game123', userId: userPayload.id }); // Correctly using userPayload.id
    expect(bet).toBeTruthy();
    expect(bet.choice).toBe('white');
    expect(bet.amount).toBe(50);
  });

  it('should not place a bet without authentication', async () => {
    const res = await request(app)
      .post('/bets/place')
      .send({
        gameId: 'game124',
        choice: 'black',
        amount: 30,
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('error', 'Access denied. No token provided.');
  });

  it('should not place a bet with missing fields', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game125',
        amount: 20,
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'gameId, choice, and amount are required');
  });
});

