// backend/tests/betRoutes.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Bet = require('../models/Bet');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { seedDatabase } = require('./setup');

// Mock the lichessService to avoid actual API calls
jest.mock('../services/lichessService', () => ({
  getGameOutcome: jest.fn().mockResolvedValue({
    success: true,
    outcome: 'white',
    whiteUsername: 'whitePlayer',
    blackUsername: 'blackPlayer',
    status: 'mate'
  }),
  createLichessGame: jest.fn().mockResolvedValue({
    success: true,
    gameId: 'test-game-123',
    gameLink: 'https://lichess.org/test-game-123'
  }),
  getUsernameFromAccessToken: jest.fn().mockResolvedValue('testuser')
}));

// Mock the notificationService to avoid socket messages
jest.mock('../services/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({})
}));

describe('Bet Routes Integration Tests', () => {
  let testUsers = [];
  let authToken = '';
  
  beforeAll(async () => {
    // Create test users
    const seedResult = await seedDatabase({ users: 3 });
    testUsers = seedResult.users;
    
    // Create auth token for the first user
    const payload = {
      id: testUsers[0]._id,
      username: testUsers[0].username,
      role: testUsers[0].role
    };
    
    authToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  });
  
  // Clear bets collection before each test
  beforeEach(async () => {
    await Bet.deleteMany({});
  });
  
  describe('GET /bets/history', () => {
    it('should return empty bet history when no bets exist', async () => {
      const response = await request(app)
        .get('/bets/history')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.bets).toEqual([]);
      expect(response.body.totalBets).toBe(0);
    });
    
    it('should return 401 if no auth token is provided', async () => {
      const response = await request(app)
        .get('/bets/history');
      
      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('AUTH_ERROR');
    });
    
    it('should return bet history for the authenticated user', async () => {
      // Create a test bet
      const bet = new Bet({
        creatorId: testUsers[0]._id,
        opponentId: testUsers[1]._id,
        creatorColor: 'white',
        amount: 100,
        timeControl: '5|3',
        variant: 'standard',
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });
      
      await bet.save();
      
      const response = await request(app)
        .get('/bets/history')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.bets.length).toBe(1);
      expect(response.body.totalBets).toBe(1);
      expect(response.body.bets[0].creatorId.username).toBe(testUsers[0].username);
    });
    
    it('should handle filtering by status', async () => {
      // Create multiple bets with different statuses
      const pendingBet = new Bet({
        creatorId: testUsers[0]._id,
        creatorColor: 'white',
        amount: 100,
        timeControl: '5|3',
        variant: 'standard',
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });
      
      const matchedBet = new Bet({
        creatorId: testUsers[0]._id,
        opponentId: testUsers[1]._id,
        creatorColor: 'black',
        amount: 200,
        timeControl: '10|5',
        variant: 'standard',
        status: 'matched',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });
      
      await pendingBet.save();
      await matchedBet.save();
      
      // Test filtering by pending status
      const pendingResponse = await request(app)
        .get('/bets/history?status=pending')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(pendingResponse.status).toBe(200);
      expect(pendingResponse.body.bets.length).toBe(1);
      expect(pendingResponse.body.bets[0].status).toBe('pending');
      
      // Test filtering by matched status
      const matchedResponse = await request(app)
        .get('/bets/history?status=matched')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(matchedResponse.status).toBe(200);
      expect(matchedResponse.body.bets.length).toBe(1);
      expect(matchedResponse.body.bets[0].status).toBe('matched');
    });
  });
  
  describe('POST /bets/place', () => {
    it('should successfully place a bet', async () => {
      const betData = {
        colorPreference: 'white',
        amount: 100,
        timeControl: '5|3',
        variant: 'standard',
        currencyType: 'token'
      };
      
      const response = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${authToken}`)
        .send(betData);
      
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Bet placed successfully');
      expect(response.body.bet.creatorColor).toBe('white');
      expect(response.body.bet.amount).toBe(100);
      
      // Check that the user's balance was updated
      const updatedUser = await User.findById(testUsers[0]._id);
      expect(updatedUser.tokenBalance).toBe(testUsers[0].tokenBalance - 100);
    });
    
    it('should return validation error for invalid input', async () => {
      const invalidBetData = {
        colorPreference: 'invalid',
        amount: -100,
        timeControl: 'invalid',
        variant: 'invalid',
        currencyType: 'invalid'
      };
      
      const response = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidBetData);
      
      expect(response.status).toBe(400);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    });
    
    it('should return error if insufficient balance', async () => {
      // Set user balance to 0
      await User.findByIdAndUpdate(testUsers[0]._id, { tokenBalance: 0 });
      
      const betData = {
        colorPreference: 'white',
        amount: 100,
        timeControl: '5|3',
        variant: 'standard',
        currencyType: 'token'
      };
      
      const response = await request(app)
        .post('/bets/place')
        .set('Authorization', `Bearer ${authToken}`)
        .send(betData);
      
      expect(response.status).toBe(400);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Insufficient token balance');
    });
  });
  
  describe('POST /bets/cancel/:betId', () => {
    it('should cancel a pending bet and refund balance', async () => {
      // Create a pending bet
      const bet = new Bet({
        creatorId: testUsers[0]._id,
        creatorColor: 'white',
        amount: 100,
        timeControl: '5|3',
        variant: 'standard',
        status: 'pending',
        currencyType: 'token',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });
      
      await bet.save();
      
      // Get initial balance
      const initialUser = await User.findById(testUsers[0]._id);
      const initialBalance = initialUser.tokenBalance;
      
      // Cancel the bet
      const response = await request(app)
        .post(`/bets/cancel/${bet._id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Bet canceled successfully');
      expect(response.body.bet.status).toBe('canceled');
      
      // Check that the balance was refunded
      const updatedUser = await User.findById(testUsers[0]._id);
      expect(updatedUser.tokenBalance).toBe(initialBalance + 100);
    });
    
    it('should return error if bet is not found', async () => {
      const nonExistentBetId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .post(`/bets/cancel/${nonExistentBetId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('NOT_FOUND');
    });
    
    it('should return error if bet is not in pending status', async () => {
      // Create a matched bet
      const bet = new Bet({
        creatorId: testUsers[0]._id,
        opponentId: testUsers[1]._id,
        creatorColor: 'white',
        amount: 100,
        timeControl: '5|3',
        variant: 'standard',
        status: 'matched', // Not pending
        currencyType: 'token',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });
      
      await bet.save();
      
      const response = await request(app)
        .post(`/bets/cancel/${bet._id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('NOT_FOUND');
    });
  });
  
  // Add more test cases for other endpoints like /bets/accept/:betId and /bets/seekers
});
