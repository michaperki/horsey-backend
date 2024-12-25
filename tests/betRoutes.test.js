// backend/tests/betRoutes.test.js

// Mock the necessary services before importing anything else
jest.mock('../services/lichessService'); // Mock lichessService
jest.mock('../services/emailService');    // Uses __mocks__/emailService.js

// Import the mocked function after jest.mock calls
const { getGameOutcome } = require('../services/lichessService'); // Import the mocked function

const request = require('supertest');
const app = require('../server'); // Import the Express app
const User = require('../models/User');
const Bet = require('../models/Bet');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('GET /bets/seekers', () => {
  let userToken;
  let seekerUser;
  let nonSeekerUser;

  beforeEach(async () => {
    // Create a seeker user
    const hashedPasswordSeeker = await bcrypt.hash('seekerpass', 10);
    seekerUser = await User.create({
      username: 'seeker',
      email: 'seeker@example.com',
      password: hashedPasswordSeeker,
      balance: 500,
    });

    // Create a non-seeker user
    const hashedPasswordNonSeeker = await bcrypt.hash('nonseekerpass', 10);
    nonSeekerUser = await User.create({
      username: 'nonseeker',
      email: 'nonseeker@example.com',
      password: hashedPasswordNonSeeker,
      balance: 300,
    });

    // Generate JWT token for the seeker user
    userToken = jwt.sign(
      { id: seekerUser._id, username: seekerUser.username, role: seekerUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create pending bets (seekers)
    await Bet.create({
      userId: seekerUser._id,
      gameId: 'game123',
      choice: 'white',
      amount: 50,
      status: 'pending',
    });

    // Create a completed bet (non-seeker)
    await Bet.create({
      userId: nonSeekerUser._id,
      gameId: 'game124',
      choice: 'black',
      amount: 30,
      status: 'won',
    });
  });

  afterEach(async () => {
    // Clean up the database after each test
    await Bet.deleteMany({});
    await User.deleteMany({});
    jest.clearAllMocks(); // Clear all mock calls and instances
  });

  it('should return all available game seekers', async () => {
    const res = await request(app)
      .get('/bets/seekers')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);

    const seeker = res.body[0];
    expect(seeker).toHaveProperty('id');
    expect(seeker).toHaveProperty('creator', 'seeker');
    expect(seeker).toHaveProperty('creatorBalance', 500);
    expect(seeker).toHaveProperty('wager', 50);
    expect(seeker).toHaveProperty('gameType', 'Standard');
    expect(seeker).toHaveProperty('createdAt');
  });

  it('should return an empty array if no seekers are available', async () => {
    // Delete existing pending bets
    await Bet.deleteMany({ status: 'pending' });

    const res = await request(app)
      .get('/bets/seekers')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('should return 401 if not authenticated', async () => {
    const res = await request(app).get('/bets/seekers').send();

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('error', 'Access denied. No token provided.');
  });

  it('should handle server errors gracefully', async () => {
    // Mock Bet.find to throw an error
    jest.spyOn(Bet, 'find').mockImplementation(() => {
      throw new Error('Database error');
    });

    const res = await request(app)
      .get('/bets/seekers')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'An unexpected error occurred while fetching seekers.');

    // Restore the original implementation
    Bet.find.mockRestore();
  });
});


describe('POST /bets/place', () => {
  let userToken, user;

  beforeEach(async () => {
    // Ensure JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in the environment variables.');
    }

    // Create a user with sufficient balance
    user = await User.create({
      username: 'testuser',
      email: 'testuser@example.com',
      password: await bcrypt.hash('password123', 10),
      balance: 1000,
    });

    // Generate JWT token for the user
    userToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Mock the behavior of getGameOutcome for 'game456'
    getGameOutcome.mockResolvedValue({
      success: true,
      status: 'created', // Ensure status is 'created' or 'started' to allow betting
    });
  });

  afterEach(async () => {
    // Clean up the database after each test
    await User.deleteMany({});
    await Bet.deleteMany({});
    jest.clearAllMocks(); // Clear all mock calls and instances
  });

  it('should successfully place a bet', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game456', // Use a unique gameId to avoid conflicts
        choice: 'white',
        amount: 100,
      });

    // Optional: Log the response body for debugging
    // console.log('Response Body:', res.body);

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('message', 'Bet placed successfully');
    expect(res.body.bet).toHaveProperty('gameId', 'game456');
    expect(res.body.bet).toHaveProperty('choice', 'white');
    expect(res.body.bet).toHaveProperty('amount', 100);
    expect(res.body.bet).toHaveProperty('userId', user._id.toString());

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.balance).toBe(900); // 1000 - 100 = 900
  });

  it('should not place a bet with insufficient balance', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game456',
        choice: 'black',
        amount: 2000, // Amount greater than user's balance
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Insufficient token balance');
  });

  it('should not place a bet with invalid choice', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game456',
        choice: 'invalidChoice', // Invalid choice
        amount: 100,
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'choice must be either "white" or "black"');
  });

  it('should not place a bet when betting is closed for the game', async () => {
    // Mock getGameOutcome to return a status that closes betting
    getGameOutcome.mockResolvedValueOnce({
      success: true,
      status: 'finished', // Status that should close betting
    });

    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game789',
        choice: 'white',
        amount: 100,
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Betting is closed for this game');
  });

  it('should return 400 for missing fields', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game456',
        // Missing 'choice' and 'amount'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'gameId, choice, and amount are required');
  });

  it('should return 401 if not authenticated', async () => {
    const res = await request(app)
      .post('/bets/place')
      .send({
        gameId: 'game456',
        choice: 'white',
        amount: 100,
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('error', 'Access denied. No token provided.');
  });

  it('should handle server errors gracefully', async () => {
    // Mock getGameOutcome to throw an error, simulating a server error
    getGameOutcome.mockRejectedValueOnce(new Error('Unexpected server error'));

    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game456',
        choice: 'white',
        amount: 100,
      });

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'Server error while placing bet');
  });
});
