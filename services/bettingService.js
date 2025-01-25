
// backend/services/bettingService.js

const { getGameOutcome } = require('./lichessService');
const Bet = require('../models/Bet');
const User = require('../models/User');
const mongoose = require('mongoose');
const { sendNotification } = require('./notificationService');

/**
 * Processes the outcome of a game by transferring tokens within the database.
 * @param {string} gameId - The ID of the Lichess game.
 * @returns {Object} - Success status and a message.
 */
const processBetOutcome = async (gameId) => {
  // Step 1: Fetch game outcome from Lichess
  const gameResult = await getGameOutcome(gameId);

  if (!gameResult.success) {
    throw new Error(`Failed to fetch game outcome: ${gameResult.error}`);
  }

  const { outcome } = gameResult; // Expected to be 'white', 'black', or 'draw'

  // Step 2: Retrieve all matched bets associated with this gameId
  const bets = await Bet.find({ gameId, status: 'matched' }).populate('creatorId opponentId');

  if (!bets || bets.length === 0) {
    throw new Error('No matched bets found for this game.');
  }

  // Initialize a session for transactional operations
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const bet of bets) {
      let winnerId = null;
      let payoutAmount = bet.amount * 2; // Total pot

      if (outcome === 'draw') {
        // In case of a draw, refund both players
        const creator = bet.creatorId;
        const opponent = bet.opponentId;

        if (bet.currencyType === 'sweepstakes') {
          creator.sweepstakesBalance += bet.amount;
          opponent.sweepstakesBalance += bet.amount;
        } else {
          creator.tokenBalance += bet.amount;
          opponent.tokenBalance += bet.amount;
        }

        bet.status = 'draw';
        await creator.save({ session });
        await opponent.save({ session });

        // Notify both users about the draw
        await sendNotification(creator._id, `Your bet on game ${gameId} ended in a draw. Your tokens have been refunded.`, 'betDrawn');
        await sendNotification(opponent._id, `Your bet on game ${gameId} ended in a draw. Your tokens have been refunded.`, 'betDrawn');
      } else {
        // Determine the winner based on the outcome
        if (bet.creatorColor === outcome) {
          winnerId = bet.creatorId._id;
        } else {
          winnerId = bet.opponentId._id;
        }

        const winner = await User.findById(winnerId).session(session);
        if (!winner) {
          throw new Error(`Winner with ID ${winnerId} not found.`);
        }

        // Update the winner's balance based on currencyType
        if (bet.currencyType === 'sweepstakes') {
          winner.sweepstakesBalance += payoutAmount;
        } else {
          winner.tokenBalance += payoutAmount;
        }

        // Update bet status and winner information
        bet.status = 'won';
        bet.winnerId = winnerId;
        await winner.save({ session });

        // Notify the winner
        await sendNotification(winnerId, `Congratulations! You won ${payoutAmount} tokens from game ${gameId}.`, 'tokensWon');
      }

      await bet.save({ session });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      message: `Processed bets for Game ID ${gameId} successfully.`,
    };
  } catch (error) {
    // Abort the transaction in case of error
    await session.abortTransaction();
    session.endSession();
    console.error('Error processing bet outcome:', error);
    throw error;
  }
};

module.exports = { processBetOutcome };

