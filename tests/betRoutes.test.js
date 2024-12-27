
// backend/tests/betRoutes.test.js

jest.mock('../services/lichessService'); // Mock lichessService
jest.mock('../services/emailService'); // Mock emailService

const { getGameOutcome } = require('../services/lichessService');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Bet = require('../models/Bet');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('Bet Routes', () => {
  let creatorToken, opponentToken, userToken;
  let creator, opponent, seekerUser, bet;

  beforeEach(async () => {
    // Create users
    seekerUser = await User.create({
      username: 'seeker',
      email: 'seeker@example.com',
      password: await bcrypt.hash('seekerpass', 10),
      balance: 500,
    });

    creator = await User.create({
      username: 'creator',
      email: 'creator@example.com',
      password: await bcrypt.hash('creatorpass', 10),
      balance: 1000,
    });

    opponent = await User.create({
      username: 'opponent',
      email: 'opponent@example.com',
      password: await bcrypt.hash('opponentpass', 10),
      balance: 500,
    });

    // Generate tokens
    creatorToken = jwt.sign({ id: creator._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    opponentToken = jwt.sign({ id: opponent._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    userToken = jwt.sign({ id: seekerUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Create a pending bet
    bet = await Bet.create({
      creatorId: creator._id,
      creatorColor: 'white',
      gameId: 'game123',
      amount: 100,
      status: 'pending',
    });

    // Mock `getGameOutcome`
    getGameOutcome.mockResolvedValue({ success: true, status: 'created' });
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Bet.deleteMany({});
    jest.restoreAllMocks(); // Restore all mocks after each test
  });

  describe('GET /bets/seekers', () => {
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
      expect(seeker).toHaveProperty('creator', 'creator');
      expect(seeker).toHaveProperty('creatorBalance', 1000);
      expect(seeker).toHaveProperty('wager', 100);
    });

    it('should return an empty array if no seekers are available', async () => {
      await Bet.deleteMany({});

      const res = await request(app)
        .get('/bets/seekers')
        .set('Authorization', `Bearer ${userToken}`)
        .send();

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual([]);
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/bets/seekers').send();

      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Access denied. No token provided.');
    });
  });

  describe('POST /bets/place', () => {
    it('should successfully place a bet', async () => {
      const res = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          gameId: 'game456',
          creatorColor: 'black',
          amount: 150,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('message', 'Bet placed successfully');
      expect(res.body.bet).toHaveProperty('creatorId', creator._id.toString());
      expect(res.body.bet).toHaveProperty('status', 'pending');

      const updatedUser = await User.findById(creator._id);
      expect(updatedUser.balance).toBe(850); // 1000 - 150
    });

    it('should return error for insufficient balance', async () => {
      const res = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          gameId: 'game456',
          creatorColor: 'black',
          amount: 2000, // More than balance
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Insufficient token balance');
    });

    it('should handle server errors gracefully', async () => {
      // Mock Bet.prototype.save to throw an error
      const mockSave = jest.spyOn(Bet.prototype, 'save').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      // Make the request to the correct endpoint
      const res = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          gameId: 'game123',
          creatorColor: 'white',
          amount: 100,
        });

      // Assertions
      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'Server error while placing bet');

      // Verify the mock was called
      expect(mockSave).toHaveBeenCalled();

      // Cleanup
      mockSave.mockRestore();
    });
  });

  describe('POST /bets/accept/:betId', () => {
    it('should accept a bet successfully and assign colors correctly', async () => {
      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          opponentColor: 'black',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Bet matched successfully');
      expect(res.body.bet).toHaveProperty('finalWhiteId');
      expect(res.body.bet).toHaveProperty('finalBlackId');

      // Verify that colors are assigned correctly
      const { finalWhiteId, finalBlackId } = res.body.bet;
      const whiteUser = finalWhiteId.toString() === creator._id.toString() ? creator : opponent;
      const blackUser = finalBlackId.toString() === creator._id.toString() ? creator : opponent;

      expect(whiteUser).toBeDefined();
      expect(blackUser).toBeDefined();
      expect(whiteUser._id.toString()).not.toBe(blackUser._id.toString());
    });

    it('should handle color conflict by random assignment', async () => {
      // Force both users to choose the same color
      bet.creatorColor = 'white';
      await bet.save();

      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          opponentColor: 'white',
        });

      expect(res.statusCode).toEqual(200);
      const { finalWhiteId, finalBlackId } = res.body.bet;

      // Both users should be assigned different colors randomly
      expect(finalWhiteId).not.toBe(finalBlackId);
      const whiteAssignedUser = [creator._id.toString(), opponent._id.toString()].includes(finalWhiteId.toString());
      const blackAssignedUser = [creator._id.toString(), opponent._id.toString()].includes(finalBlackId.toString());

      expect(whiteAssignedUser).toBe(true);
      expect(blackAssignedUser).toBe(true);
    });

    it('should return error if opponent balance is insufficient', async () => {
      // Set opponent's balance to be insufficient
      opponent.balance = 50; // Insufficient balance
      await opponent.save();

      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          opponentColor: 'black',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Insufficient balance to accept this bet');
    });

    it('should handle server errors gracefully when fetching the bet', async () => {
      // Mock Bet.findOne to throw an error
      const mockFindOne = jest.spyOn(Bet, 'findOne').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      // Make the request
      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          opponentColor: 'black',
        });

      // Assertions
      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'An unexpected error occurred while accepting the bet.');

      // Verify the mock was called
      expect(mockFindOne).toHaveBeenCalled();

      // Cleanup
      mockFindOne.mockRestore();
    });

    it('should handle server errors gracefully when saving the bet', async () => {
      // Mock bet.save() to throw an error
      const mockSave = jest.spyOn(Bet.prototype, 'save').mockImplementationOnce(() => {
        throw new Error('Save error');
      });

      // Make the request
      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          opponentColor: 'black',
        });

      // Assertions
      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'An unexpected error occurred while accepting the bet.');

      // Verify the mock was called
      expect(mockSave).toHaveBeenCalled();

      // Cleanup
      mockSave.mockRestore();
    });
  });
});

