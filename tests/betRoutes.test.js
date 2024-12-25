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

describe('GET /bets/your-bets', () => {
  let userToken;
  let user;
  let bets;

  // This hook runs before each test, ensuring a fresh state
  beforeEach(async () => {
    // Create a user
    user = await User.create({
      username: 'historyuser',
      email: 'historyuser@example.com',
      password: await bcrypt.hash('testpassword', 10),
      balance: 1000,
    });

    // Generate JWT token for the user
    userToken = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create multiple bets for pagination and sorting
    bets = [];
    for (let i = 1; i <= 25; i++) {
      bets.push(await Bet.create({
        userId: user._id,
        gameId: `game${i}`,
        choice: i % 2 === 0 ? 'white' : 'black',
        amount: 10 * i,
        status: i % 3 === 0 ? 'won' : i % 3 === 1 ? 'lost' : 'pending',
        createdAt: new Date(Date.now() - i * 1000 * 60), // Different timestamps
      }));
    }
  });

  // This hook runs after each test, cleaning up the database
  afterEach(async () => {
    await Bet.deleteMany({});
    await User.deleteMany({});
  });

  it('should return the first page of user bets with default limit', async () => {
    const res = await request(app)
      .get('/bets/your-bets')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 10);
    expect(res.body).toHaveProperty('totalBets', 25);
    expect(res.body).toHaveProperty('totalPages', 3);
    expect(res.body.bets.length).toBe(10);

    // Verify sorting by createdAt descending
    const firstBetTime = new Date(res.body.bets[0].createdAt).getTime();
    const secondBetTime = new Date(res.body.bets[1].createdAt).getTime();
    expect(firstBetTime).toBeGreaterThan(secondBetTime);
  });

  it('should return the specified page and limit', async () => {
    const res = await request(app)
      .get('/bets/your-bets?page=2&limit=5')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('page', 2);
    expect(res.body).toHaveProperty('limit', 5);
    expect(res.body).toHaveProperty('totalBets', 25);
    expect(res.body).toHaveProperty('totalPages', 5);
    expect(res.body.bets.length).toBe(5);
  });

  it('should sort bets by amount ascending', async () => {
    const res = await request(app)
      .get('/bets/your-bets?sortBy=amount&order=asc')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(200);
    expect(res.body.bets[0].amount).toBe(10);
    expect(res.body.bets[9].amount).toBe(100);
  });

  it('should return 400 for invalid sort field', async () => {
    const res = await request(app)
      .get('/bets/your-bets?sortBy=invalidField')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Invalid sort field. Valid fields are: createdAt, amount, gameId, status');
  });

  it('should return 401 if not authenticated', async () => {
    const res = await request(app).get('/bets/your-bets').send();

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('error', 'Access denied. No token provided.');
  });

  it('should handle server errors gracefully', async () => {
    // Mock Bet.find to throw an error
    jest.spyOn(Bet, 'find').mockImplementation(() => {
      throw new Error('Database error');
    });

    const res = await request(app)
      .get('/bets/your-bets')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'An unexpected error occurred while fetching your bets.');

    // Restore the original implementation
    Bet.find.mockRestore();
  });
});
