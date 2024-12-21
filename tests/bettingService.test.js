
// backend/tests/bettingService.test.js
const mongoose = require('mongoose');
const { processBetOutcome } = require('../services/bettingService');
const Bet = require('../models/Bet');
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const { getGameOutcome } = require('../services/lichessService');

jest.mock('../services/tokenService');
jest.mock('../services/lichessService');

describe('Betting Service', () => {
  let user;
  let bet;

  beforeAll(async () => {
    // Connect to in-memory MongoDB
    const { connect } = require('./setup');
    await connect();

    // Create a user
    user = await User.create({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'hashedpassword',
      balance: 1000,
    });

    // Create a bet
    bet = await Bet.create({
      userId: user._id,
      gameId: 'game123',
      choice: 'white',
      amount: 100,
    });
  });

  afterAll(async () => {
    const { closeDatabase } = require('./setup');
    await closeDatabase();
  });

  it('processes winning bets correctly', async () => {
    getGameOutcome.mockResolvedValue({ success: true, outcome: 'white' });
    tokenService.mintTokens.mockResolvedValue({ success: true, txHash: '0xabc' });

    const result = await processBetOutcome('game123');

    expect(result.success).toBe(true);
    expect(result.message).toContain('winning bets');

    const updatedBet = await Bet.findById(bet._id);
    expect(updatedBet.status).toBe('won');
    expect(tokenService.mintTokens).toHaveBeenCalledWith(user._id, 10);
  });

  it('processes losing bets correctly', async () => {
    // Place another bet that will lose
    const losingBet = await Bet.create({
      userId: user._id,
      gameId: 'game123',
      choice: 'black',
      amount: 50,
    });

    getGameOutcome.mockResolvedValue({ success: true, outcome: 'white' });
    tokenService.mintTokens.mockResolvedValue({ success: true, txHash: '0xdef' });

    const result = await processBetOutcome('game123');

    expect(result.success).toBe(true);
    expect(result.message).toContain('losing bets');

    const updatedBet = await Bet.findById(losingBet._id);
    expect(updatedBet.status).toBe('lost');
    expect(tokenService.mintTokens).not.toHaveBeenCalledWith(user._id, 50);
  });

  it('handles invalid game outcomes gracefully', async () => {
    getGameOutcome.mockResolvedValue({ success: false, error: 'Invalid game ID' });

    await expect(processBetOutcome('invalidGame')).rejects.toThrow('Failed to fetch game outcome');
  });
});
