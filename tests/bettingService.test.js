
// backend/tests/bettingService.test.js

const mongoose = require('mongoose');
const { clearDatabase } = require('./setup');

// Remove mocking of tokenService as it's not used in processBetOutcome
// jest.mock('../services/tokenService'); // Removed this line

// Mock external services
jest.mock('../services/lichessService');
jest.mock('../services/notificationService', () => ({
  sendNotification: jest.fn(),
}));

// Import models and services after the global connection is established
const User = require('../models/User');
const Bet = require('../models/Bet');
const { getGameOutcome } = require('../services/lichessService');
const { sendNotification } = require('../services/notificationService');
const { processBetOutcome } = require('../services/bettingService');

describe('Betting Service', () => {
  let user;
  let opponent;

  beforeEach(async () => {
    // Clear the database before each test
    await clearDatabase();

    // Create test users with lichessUsername
    user = await User.create({
      username: 'testuser',
      lichessUsername: 'testuser', // Added lichessUsername
      email: 'testuser@example.com',
      password: 'hashedpassword',
      tokenBalance: 1000,
      sweepstakesBalance: 500,
    });

    opponent = await User.create({
      username: 'opponentuser',
      lichessUsername: 'opponentuser', // Added lichessUsername
      email: 'opponent@example.com',
      password: 'hashedpassword',
      tokenBalance: 1000,
      sweepstakesBalance: 500,
    });

    // Ensure users are created successfully
    expect(user).toBeDefined();
    expect(opponent).toBeDefined();
  });

  afterEach(() => {
    // Reset all mocks after each test
    jest.clearAllMocks();
  });

  it('should process winning bets correctly', async () => {
    const gameId = 'game123';
    const betAmount = 100;

    // Create a matched bet
    const matchedBet = await Bet.create({
      creatorId: user._id,
      opponentId: opponent._id,
      gameId,
      status: 'matched',
      creatorColor: 'white',
      amount: betAmount,
      currencyType: 'token',
    });

    // Deduct the bet amount from both users to simulate a matched bet
    user.tokenBalance -= betAmount;
    opponent.tokenBalance -= betAmount;
    await user.save();
    await opponent.save();

    // Mock the game outcome to be 'white' (creator wins) with usernames
    getGameOutcome.mockResolvedValueOnce({
      success: true,
      outcome: 'white',
      whiteUsername: user.lichessUsername, // Added
      blackUsername: opponent.lichessUsername, // Added
    });

    // Mock sendNotification to always resolve successfully
    sendNotification.mockResolvedValue(true);

    const result = await processBetOutcome(gameId);

    expect(result.success).toBe(true);
    expect(result.message).toContain(`Processed bets for Game ID ${gameId}.`);

    const updatedBet = await Bet.findById(matchedBet._id).populate('winnerId');
    expect(updatedBet.status).toBe('won');
    expect(updatedBet.winnerId._id.toString()).toBe(user._id.toString());

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.tokenBalance).toBe(1000 - betAmount + betAmount * 2); // 1000 - 100 + 200 = 1100

    const updatedOpponent = await User.findById(opponent._id);
    expect(updatedOpponent.tokenBalance).toBe(1000 - betAmount); // 1000 - 100 = 900

    // Verify that sendNotification was called once for the winner with updated message
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      user._id,
      `Congrats! You won ${betAmount * 2}. Old: ${1000 - betAmount}, New: ${1000 - betAmount + betAmount * 2}`,
      'tokensWon'
    );
  });

  it('should process losing bets correctly', async () => {
    const gameId = 'game456';
    const betAmount = 50;

    // Create a matched bet where creator loses (creatorColor: 'black', opponentColor: 'white')
    const losingBet = await Bet.create({
      creatorId: user._id,
      opponentId: opponent._id,
      gameId,
      status: 'matched',
      creatorColor: 'black',
      amount: betAmount,
      currencyType: 'token',
    });

    // Deduct the bet amount from both users to simulate a matched bet
    user.tokenBalance -= betAmount;
    opponent.tokenBalance -= betAmount;
    await user.save();
    await opponent.save();

    // Mock the game outcome to be 'white' (opponent wins) with usernames
    getGameOutcome.mockResolvedValueOnce({
      success: true,
      outcome: 'white',
      whiteUsername: opponent.lichessUsername, // Opponent wins
      blackUsername: user.lichessUsername,
    });

    // Mock sendNotification to always resolve successfully
    sendNotification.mockResolvedValue(true);

    const result = await processBetOutcome(gameId);

    expect(result.success).toBe(true);
    expect(result.message).toContain(`Processed bets for Game ID ${gameId}.`);

    const updatedBet = await Bet.findById(losingBet._id).populate('winnerId');
    expect(updatedBet.status).toBe('won');
    expect(updatedBet.winnerId._id.toString()).toBe(opponent._id.toString());

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.tokenBalance).toBe(1000 - betAmount); // 1000 - 50 = 950

    const updatedOpponent = await User.findById(opponent._id);
    expect(updatedOpponent.tokenBalance).toBe(1000 - betAmount + betAmount * 2); // 1000 - 50 + 100 = 1050

    // Verify that sendNotification was called once for the winner with updated message
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      opponent._id,
      `Congrats! You won ${betAmount * 2}. Old: ${1000 - betAmount}, New: ${1000 - betAmount + betAmount * 2}`,
      'tokensWon'
    );
  });

  it('should handle draw outcomes by refunding both players', async () => {
    const gameId = 'game789';
    const betAmount = 200;

    // Create a matched bet
    const drawBet = await Bet.create({
      creatorId: user._id,
      opponentId: opponent._id,
      gameId,
      status: 'matched',
      creatorColor: 'white',
      amount: betAmount,
      currencyType: 'token',
    });

    // Deduct the bet amount from both users to simulate a matched bet
    user.tokenBalance -= betAmount;
    opponent.tokenBalance -= betAmount;
    await user.save();
    await opponent.save();

    // Mock the game outcome to be 'draw' with usernames
    getGameOutcome.mockResolvedValueOnce({
      success: true,
      outcome: 'draw',
      whiteUsername: user.lichessUsername,
      blackUsername: opponent.lichessUsername,
    });

    // Mock sendNotification to always resolve successfully
    sendNotification.mockResolvedValue(true);

    const result = await processBetOutcome(gameId);

    expect(result.success).toBe(true);
    expect(result.message).toContain(`Processed bets for Game ID ${gameId}.`);

    const updatedBet = await Bet.findById(drawBet._id);
    expect(updatedBet.status).toBe('draw');
    expect(updatedBet.winnerId).toBeNull(); // Changed to beNull()

    const updatedUser = await User.findById(user._id);
    const updatedOpponent = await User.findById(opponent._id);
    expect(updatedUser.tokenBalance).toBe(1000); // 1000 - 200 + 200
    expect(updatedOpponent.tokenBalance).toBe(1000); // 1000 - 200 + 200

    // Verify that sendNotification was called twice for both users with updated messages
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      user._id,
      `Game ${gameId} ended in a draw. Refunded ${betAmount}. Old: ${1000 - betAmount}, New: ${1000 - betAmount + betAmount}`,
      'betDrawn'
    );
    expect(sendNotification).toHaveBeenCalledWith(
      opponent._id,
      `Game ${gameId} ended in a draw. Refunded ${betAmount}. Old: ${1000 - betAmount}, New: ${1000 - betAmount + betAmount}`,
      'betDrawn'
    );
  });
});

