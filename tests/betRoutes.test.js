
// backend/tests/betRoutes.test.js

jest.mock('../services/lichessService'); // Mock lichessService
jest.mock('../services/emailService'); // Mock emailService

const { getGameOutcome, createLichessGame } = require('../services/lichessService');
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
    // Create users with lichessUsername
    seekerUser = await User.create({
      username: 'seeker',
      email: 'seeker@example.com',
      password: await bcrypt.hash('seekerpass', 10),
      balance: 500,
      // Assuming seeker doesn't need a Lichess account for these tests
    });

    creator = await User.create({
      username: 'creator',
      email: 'creator@example.com',
      password: await bcrypt.hash('creatorpass', 10),
      balance: 1000,
      lichessUsername: 'creatorLichessUser', // Add Lichess username
      lichessAccessToken: 'creatorAccessToken', // Ensure access token is present
    });

    opponent = await User.create({
      username: 'opponent',
      email: 'opponent@example.com',
      password: await bcrypt.hash('opponentpass', 10),
      balance: 500,
      lichessUsername: 'opponentLichessUser', // Add Lichess username
      lichessAccessToken: 'opponentAccessToken', // Ensure access token is present
    });

    // Generate tokens
    creatorToken = jwt.sign({ id: creator._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    opponentToken = jwt.sign({ id: opponent._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    userToken = jwt.sign({ id: seekerUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Create a pending bet without gameId
    bet = await Bet.create({
      creatorId: creator._id,
      creatorColor: 'white',
      amount: 100,
      status: 'pending',
      timeControl: '5|3',
    });

    // Mock getGameOutcome
    getGameOutcome.mockResolvedValue({ success: true, status: 'created' });

    // Mock createLichessGame to return gameId instead of bulkId
    createLichessGame.mockResolvedValue({
      success: true,
      gameId: 'lichessGameId123', // Updated to gameId
      gameLink: 'https://lichess.org/lichessGameId123', // Added gameLink if necessary
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Bet.deleteMany({});
    jest.resetAllMocks(); // Reset all mocks after each test
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
      expect(seeker).toHaveProperty('gameType', 'Standard');
      expect(seeker).toHaveProperty('colorPreference', 'white'); // Ensure colorPreference is present
      expect(seeker).toHaveProperty('createdAt');
    });

    it('should return an empty array if no seekers are available', async () => {
      await Bet.deleteMany({ status: 'pending' });

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
    it('should successfully place a bet without gameId', async () => {
      const res = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          colorPreference: 'black',
          amount: 150,
          timeControl: '3|2',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('message', 'Bet placed successfully');
      expect(res.body.bet).toHaveProperty('creatorId', creator._id.toString());
      expect(res.body.bet).toHaveProperty('status', 'pending');
      expect(res.body.bet).toHaveProperty('gameId', null);
      expect(res.body.bet).toHaveProperty('timeControl', '3|2');

      const updatedUser = await User.findById(creator._id);
      expect(updatedUser.balance).toBe(850); // 1000 - 150
    });

    it('should return error for insufficient balance', async () => {
      const res = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          colorPreference: 'black',
          amount: 2000, // More than balance
          timeControl: '5|3',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Insufficient token balance');
    });

    it('should handle server errors gracefully', async () => {
      // Mock Bet.prototype.save to throw an error
      const mockSave = jest.spyOn(Bet.prototype, 'save').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      // Make the request to place a bet
      const res = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          colorPreference: 'white',
          amount: 100,
          timeControl: '5|3',
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
          colorPreference: 'black',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Bet matched successfully'); // Updated message
      expect(res.body.bet).toHaveProperty('finalWhiteId');
      expect(res.body.bet).toHaveProperty('finalBlackId');
      expect(res.body.bet).toHaveProperty('gameId', 'lichessGameId123'); // Updated to gameId
      expect(res.body.bet).toHaveProperty('status', 'matched');

      // Verify that colors are assigned correctly
      const { finalWhiteId, finalBlackId } = res.body.bet;
      expect([finalWhiteId, finalBlackId]).toContain(creator._id.toString());
      expect([finalWhiteId, finalBlackId]).toContain(opponent._id.toString());

      // Verify that the opponent's balance was deducted
      const updatedOpponent = await User.findById(opponent._id);
      expect(updatedOpponent.balance).toBe(400); // 500 - 100
    });

    it('should handle color conflict by random assignment', async () => {
      // Force both users to choose the same color
      bet.creatorColor = 'white';
      await bet.save();

      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          colorPreference: 'white',
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
          colorPreference: 'black',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Insufficient balance to accept this bet');
    });

    it('should handle server errors gracefully when fetching the bet', async () => {
      // Mock Bet.findOneAndUpdate to throw an error
      const mockFindOneAndUpdate = jest.spyOn(Bet, 'findOneAndUpdate').mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      // Make the request
      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          colorPreference: 'black',
        });

      // Assertions
      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'An unexpected error occurred while accepting the bet.');

      // Verify the mock was called
      expect(mockFindOneAndUpdate).toHaveBeenCalled();

      // Cleanup
      mockFindOneAndUpdate.mockRestore();
    });

    it('should handle server errors gracefully when creating the Lichess game', async () => {
      // Mock createLichessGame to fail
      createLichessGame.mockResolvedValueOnce({ success: false, error: 'Lichess API error' }); // Provide an error message

      // Make the request
      const res = await request(app)
        .post(`/bets/accept/${bet._id}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({
          colorPreference: 'black',
        });

      // Assertions
      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'Failed to create Lichess game');
      expect(res.body).toHaveProperty('details', 'Lichess API error'); // Ensure details are present

      // Verify that the opponent's balance was reverted
      const updatedOpponent = await User.findById(opponent._id);
      expect(updatedOpponent.balance).toBe(500); // Original balance, since deduction was reverted
    });
  });
});

