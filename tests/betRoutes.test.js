
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
      creatorId: seekerUser._id,
      gameId: 'game123',
      creatorColor: 'white',
      amount: 50,
      status: 'pending',
    });

    // Create a completed bet (non-seeker)
    await Bet.create({
      creatorId: nonSeekerUser._id,
      gameId: 'game124',
      creatorColor: 'black',
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
        creatorColor: 'white',
        amount: 100,
      });

    // Optional: Log the response body for debugging
    // console.log('Response Body:', res.body);

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('message', 'Bet placed successfully');
    expect(res.body.bet).toHaveProperty('gameId', 'game456');
    expect(res.body.bet).toHaveProperty('creatorColor', 'white');
    expect(res.body.bet).toHaveProperty('amount', 100);
    expect(res.body.bet).toHaveProperty('creatorId', user._id.toString());
    expect(res.body.bet).toHaveProperty('status', 'pending');

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.balance).toBe(900); // 1000 - 100 = 900
  });

  it('should not place a bet with insufficient balance', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game456',
        creatorColor: 'black',
        amount: 2000, // Amount greater than user's balance
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Insufficient token balance');
  });

  it('should not place a bet with invalid creatorColor', async () => {
    const res = await request(app)
      .post('/bets/place')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        gameId: 'game456',
        creatorColor: 'invalidColor', // Invalid choice
        amount: 100,
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'creatorColor must be "white", "black", or "random"');
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
        creatorColor: 'white',
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
        // Missing 'creatorColor' and 'amount'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'gameId, creatorColor, and amount are required');
  });

  it('should return 401 if not authenticated', async () => {
    const res = await request(app)
      .post('/bets/place')
      .send({
        gameId: 'game456',
        creatorColor: 'white',
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
        creatorColor: 'white',
        amount: 100,
      });

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'Server error while placing bet');
  });
});


describe('POST /bets/accept/:betId', () => {
  let creatorToken, opponentToken;
  let creator, opponent, bet;
  let seekerUser; // Define seekerUser

  beforeEach(async () => {
    // Create seeker user
    seekerUser = await User.create({
      username: 'seeker',
      email: 'seeker@example.com',
      password: await bcrypt.hash('seekerpass', 10),
      balance: 500,
    });

    // Create creator user
    creator = await User.create({
      username: 'creator',
      email: 'creator@example.com',
      password: await bcrypt.hash('creatorpass', 10),
      balance: 1000,
    });

    // Create opponent user
    opponent = await User.create({
      username: 'opponent',
      email: 'opponent@example.com',
      password: await bcrypt.hash('opponentpass', 10),
      balance: 500,
    });

    // Generate JWT tokens
    creatorToken = jwt.sign(
      { id: creator._id, username: creator.username, role: creator.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    opponentToken = jwt.sign(
      { id: opponent._id, username: opponent.username, role: opponent.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create a pending bet
    bet = await Bet.create({
      creatorId: creator._id,
      creatorColor: 'white',
      gameId: 'game789',
      amount: 100,
      status: 'pending',
    });
  });

  afterEach(async () => {
    await Bet.deleteMany({});
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('should accept a bet successfully and assign colors correctly', async () => {
    const res = await request(app)
      .post(`/bets/accept/${bet._id}`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({
        opponentColor: 'black',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message', 'Bet matched successfully');
    expect(res.body.bet).toHaveProperty('opponentId', opponent._id.toString());
    expect(res.body.bet).toHaveProperty('opponentColor', 'black');
    expect(res.body.bet).toHaveProperty('status', 'matched');
    expect(res.body.bet).toHaveProperty('finalWhiteId', creator._id.toString());
    expect(res.body.bet).toHaveProperty('finalBlackId', opponent._id.toString());

    // Verify opponent's balance deduction
    const updatedOpponent = await User.findById(opponent._id);
    expect(updatedOpponent.balance).toBe(400); // 500 - 100 = 400
  });

  it('should handle color conflict by random assignment', async () => {
    // Both creator and opponent choose 'white'

    // Update the bet to have creatorColor 'white'
    bet.creatorColor = 'white';
    await bet.save();

    const res = await request(app)
      .post(`/bets/accept/${bet._id}`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({
        opponentColor: 'white',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message', 'Bet matched successfully');
    expect(res.body.bet.status).toBe('matched');

    // Since both chose 'white', colors should be assigned randomly
    const finalWhiteId = res.body.bet.finalWhiteId;
    const finalBlackId = res.body.bet.finalBlackId;

    expect(
      (finalWhiteId === creator._id.toString() && finalBlackId === opponent._id.toString()) ||
      (finalWhiteId === opponent._id.toString() && finalBlackId === creator._id.toString())
    ).toBe(true);
  });

  it('should return error if bet is already matched', async () => {
    // Accept the bet first
    await Bet.findByIdAndUpdate(bet._id, {
      opponentId: opponent._id,
      opponentColor: 'black',
      status: 'matched',
      finalWhiteId: creator._id,
      finalBlackId: opponent._id,
    });

    const res = await request(app)
      .post(`/bets/accept/${bet._id}`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({
        opponentColor: 'black',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Bet is no longer available or does not exist');
  });

  it('should return error if opponent has insufficient balance', async () => {
    // Opponent's balance is already 500

    // Reduce opponent's balance to 50
    opponent.balance = 50;
    await opponent.save();

    const res = await request(app)
      .post(`/bets/accept/${bet._id}`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({
        opponentColor: 'black',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Insufficient balance to accept this bet');

    // Verify that the bet's opponentId and opponentColor are reverted
    const updatedBet = await Bet.findById(bet._id);
    expect(updatedBet.opponentId).toBeNull();
    expect(updatedBet.opponentColor).toBeNull();
    expect(updatedBet.status).toBe('pending');
  });

  it('should return 404 if opponent user does not exist', async () => {
    // Delete the opponent user
    await User.findByIdAndDelete(opponent._id);

    const res = await request(app)
      .post(`/bets/accept/${bet._id}`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({
        opponentColor: 'black',
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty('error', 'Opponent user not found');

    // Verify that the bet's opponentId and opponentColor are reverted
    const updatedBet = await Bet.findById(bet._id);
    expect(updatedBet.opponentId).toBeNull();
    expect(updatedBet.opponentColor).toBeNull();
    expect(updatedBet.status).toBe('pending');
  });

  it('should return 400 for invalid betId', async () => {
    const invalidBetId = 'invalidBetId123';

    const res = await request(app)
      .post(`/bets/accept/${invalidBetId}`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({
        opponentColor: 'black',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Invalid bet ID');
  });

  it('should handle server errors gracefully', async () => {
    // Mock Bet.findOneAndUpdate to throw an error
    jest.spyOn(Bet, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('Database error');
    });

    const res = await request(app)
      .post(`/bets/accept/${bet._id}`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({
        opponentColor: 'black',
      });

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'An unexpected error occurred while accepting the bet.');

    // Restore the original implementation
    Bet.findOneAndUpdate.mockRestore();
  });
});

