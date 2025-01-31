
// backend/services/bettingService.js

const mongoose = require('mongoose');
const Bet = require('../models/Bet');
const User = require('../models/User');
const { getGameOutcome } = require('./lichessService');
const { sendNotification } = require('./notificationService');

/**
 * Processes bets for a concluded game.
 * - Updates winner/loser balances
 * - Handles draw refunds
 * - Sends notifications with old/new balances
 */
const processBetOutcome = async (gameId) => {
  // 1. Fetch outcome from Lichess
  const gameResult = await getGameOutcome(gameId);
  if (!gameResult.success) {
    throw new Error(`Failed to fetch game outcome: ${gameResult.error}`);
  }

  const { outcome, whiteUsername, blackUsername } = gameResult;

  // 2. Retrieve matching bets
  const bets = await Bet.find({ gameId, status: 'matched' });
  if (!bets.length) {
    throw new Error(`No matched bets found for game ${gameId}.`);
  }

  // 3. Identify actual white/black users
  const whiteUser = await User.findOne({ lichessUsername: whiteUsername });
  const blackUser = await User.findOne({ lichessUsername: blackUsername });

  // (It's possible these might be missing for some reason; handle gracefully)
  if (!whiteUser || !blackUser) {
    throw new Error(`Could not find white or black user for game ${gameId}.`);
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
      } else {
        bet.status = 'won';
        // Determine winner based on final outcome
        const winner = outcome === 'white' ? whiteUser : blackUser;
        bet.winnerId = winner._id;
        await handleWin(bet, winner, session);
      }
      await bet.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return { success: true, message: `Processed bets for Game ID ${gameId}.` };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error processing bet outcome:', error);
    throw error;
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
  await user.save({ session });
  await sendNotification(
    user._id,
    `Game ${gameId} ended in a draw. Refunded ${amount}. Old: ${oldBalance}, New: ${user[balanceKey]}`,
    'betDrawn'
  );
}

async function handleWin(bet, winner, session) {
  const pot = bet.amount * 2;
  bet.winnings = pot;  // Set the winnings
  const balanceKey = bet.currencyType === 'sweepstakes' ? 'sweepstakesBalance' : 'tokenBalance';

  const oldBalance = winner[balanceKey];
  winner[balanceKey] += pot;
  await winner.save({ session });

  await sendNotification(
    winner._id,
    `Congrats! You won ${pot}. Old: ${oldBalance}, New: ${winner[balanceKey]}`,
    'tokensWon'
  );
}

module.exports = { processBetOutcome };

