// backend/services/bettingService.js

const mongoose = require('mongoose');
const Bet = require('../models/Bet');
const User = require('../models/User');
const { getGameOutcome } = require('./lichessService');
const { sendNotification } = require('./notificationService');
const { ResourceNotFoundError, ExternalServiceError, DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');
const seasonService = require('./seasonService');

/**
 * Processes bets for a concluded game.
 * - Updates winner/loser balances
 * - Handles draw refunds
 * - Sends notifications with old/new balances
 * - Updates season statistics
 */
const processBetOutcome = async (gameId) => {
  // 1. Fetch outcome from Lichess
  const gameResult = await getGameOutcome(gameId);
  if (!gameResult.success) {
    throw new ExternalServiceError('Lichess', `Failed to fetch game outcome: ${gameResult.error}`);
  }

  const { outcome, whiteUsername, blackUsername } = gameResult;

  // 2. Retrieve matching bets
  const bets = await Bet.find({ gameId, status: 'matched' });
  if (!bets.length) {
    throw new ResourceNotFoundError(`No matched bets found for game ${gameId}`);
  }

  // 3. Identify actual white/black users
  const whiteUser = await User.findOne({ lichessUsername: whiteUsername });
  const blackUser = await User.findOne({ lichessUsername: blackUsername });

  if (!whiteUser || !blackUser) {
    throw new ResourceNotFoundError(`Could not find white or black user for game ${gameId}`);
  }

  // 4. Transactional handling
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const bet of bets) {
      // Set final white/black references
      bet.finalWhiteId = whiteUser._id;
      bet.finalBlackId = blackUser._id;

      // Distinguish draw vs. winner
      if (outcome === 'draw') {
        bet.status = 'draw';
        bet.winnerId = null;
        await handleDraw(bet, whiteUser, blackUser, session);
        
        // Update season stats for draw
        await seasonService.updateSeasonStatsOnDraw(bet, [whiteUser, blackUser]);
      } else {
        bet.status = 'won';
        // Determine winner based on final outcome
        const winner = outcome === 'white' ? whiteUser : blackUser;
        const loser = outcome === 'white' ? blackUser : whiteUser;
        bet.winnerId = winner._id;
        await handleWin(bet, winner, session);
        
        // Update season stats for win/loss
        await seasonService.updateSeasonStatsOnBetConcluded(bet, winner, loser);
      }
      await bet.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    logger.info('Processed bet outcomes', { gameId, outcome });
    return { success: true, message: `Processed bets for Game ID ${gameId}.` };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Error processing bet outcome', { gameId, error: error.message, stack: error.stack });
    
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      throw new DatabaseError(`Failed to process bet outcome: ${error.message}`);
    }
    
    if (error.isOperational) {
      throw error;
    }
    
    throw new Error(`Failed to process bet outcome: ${error.message}`);
  }
};

async function handleDraw(bet, whiteUser, blackUser, session) {
  const refund = bet.amount;
  if (bet.currencyType === 'sweepstakes') {
    await refundBalance(whiteUser, refund, 'sweepstakesBalance', bet.gameId, session);
    await refundBalance(blackUser, refund, 'sweepstakesBalance', bet.gameId, session);
  } else {
    await refundBalance(whiteUser, refund, 'tokenBalance', bet.gameId, session);
    await refundBalance(blackUser, refund, 'tokenBalance', bet.gameId, session);
  }
}

async function refundBalance(user, amount, balanceKey, gameId, session) {
  const oldBalance = user[balanceKey];
  user[balanceKey] += amount;
  
  try {
    await user.save({ session });
    await sendNotification(
      user._id,
      `Game ${gameId} ended in a draw. Refunded ${amount}. Old: ${oldBalance}, New: ${user[balanceKey]}`,
      'betDrawn'
    );
    logger.info('Refunded user balance for draw', { userId: user._id, gameId, refunded: amount, oldBalance, newBalance: user[balanceKey] });
  } catch (error) {
    logger.error('Failed to refund user balance', { userId: user._id, gameId, error: error.message });
    throw new DatabaseError(`Failed to refund user balance: ${error.message}`);
  }
}

async function handleWin(bet, winner, session) {
  const pot = bet.amount * 2;
  bet.winnings = pot;  // Set the winnings
  const balanceKey = bet.currencyType === 'sweepstakes' ? 'sweepstakesBalance' : 'tokenBalance';

  const oldBalance = winner[balanceKey];
  winner[balanceKey] += pot;
  
  try {
    await winner.save({ session });
    await sendNotification(
      winner._id,
      `Congrats! You won ${pot}. Old: ${oldBalance}, New: ${winner[balanceKey]}`,
      'tokensWon'
    );
    logger.info('Updated winner balance', { winnerId: winner._id, gameId: bet.gameId, pot, oldBalance, newBalance: winner[balanceKey] });
  } catch (error) {
    logger.error('Failed to update winner balance', { winnerId: winner._id, gameId: bet.gameId, error: error.message });
    throw new DatabaseError(`Failed to update winner balance: ${error.message}`);
  }
}

module.exports = { processBetOutcome };
