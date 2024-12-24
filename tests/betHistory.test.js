
// backend/tests/betHistory.test.js

const request = require('supertest');
const app = require('../server'); // Import the Express app
const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('GET /bets/history', () => {
  let userToken;
  let user;

  // This hook runs before each test, ensuring a fresh state
  beforeEach(async () => {
    // Create a user
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    user = await User.create({
      username: 'historyuser',
      email: 'historyuser@example.com',
      password: hashedPassword,
    });

    // Generate JWT token for the user
    userToken = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create multiple bets for pagination and sorting
    const bets = [];
    for (let i = 1; i <= 25; i++) {
      bets.push({
        userId: user._id,
        gameId: `game${i}`,
        choice: i % 2 === 0 ? 'white' : 'black',
        amount: 10 * i,
        status: i % 3 === 0 ? 'won' : i % 3 === 1 ? 'lost' : 'pending',
        createdAt: new Date(Date.now() - i * 1000 * 60), // Different timestamps
      });
    }
    await Bet.insertMany(bets);
  });

  // This hook runs after each test, cleaning up the database
  afterEach(async () => {
    await Bet.deleteMany({});
    await User.deleteMany({});
  });

  it('should return the first page of bet history with default limit', async () => {
    const res = await request(app)
      .get('/bets/history')
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
      .get('/bets/history?page=2&limit=5')
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
      .get('/bets/history?sortBy=amount&order=asc')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(200);
    expect(res.body.bets[0].amount).toBe(10);
    expect(res.body.bets[9].amount).toBe(100);
  });

  it('should return 400 for invalid sort field', async () => {
    const res = await request(app)
      .get('/bets/history?sortBy=invalidField')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty(
      'error',
      'Invalid sort field. Valid fields are: createdAt, amount, gameId, status'
    );
  });

  it('should return 401 if not authenticated', async () => {
    const res = await request(app).get('/bets/history').send();

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('error', 'Access denied. No token provided.');
  });

  it('should handle server errors gracefully', async () => {
    // Mock Bet.find to throw an error
    jest.spyOn(Bet, 'find').mockImplementation(() => {
      throw new Error('Database error');
    });

    const res = await request(app)
      .get('/bets/history')
      .set('Authorization', `Bearer ${userToken}`)
      .send();

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'An unexpected error occurred while fetching bet history.');

    // Restore the original implementation
    Bet.find.mockRestore();
  });
});
