
// backend/controllers/lichessController.js

const { getGameOutcome } = require('../services/lichessService');
const Bet = require('../models/Bet');
const tokenService = require('../services/tokenService');
const { sendEmail } = require('../services/emailService');

/**
 * Validates the result of a game and updates related bets.
 */
const validateResultHandler = async (req, res) => {
  const { gameId } = req.body;
  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' });
  }

  try {
    const gameResult = await getGameOutcome(gameId);
    if (!gameResult.success) {
      return res.status(500).json({ error: gameResult.error });
    }

    const { outcome } = gameResult;
    const bets = await Bet.find({ gameId, status: 'matched' })
      .populate('finalWhiteId', 'email username')
      .populate('finalBlackId', 'email username');

    if (!bets.length) {
      return res.status(404).json({ error: 'No matched bets found for this game' });
    }

    for (const bet of bets) {
      let winnerId, winnerEmail, winnerUsername;
      if (outcome === 'white') {
        winnerId = bet.finalWhiteId._id;
        winnerEmail = bet.finalWhiteId.email;
        winnerUsername = bet.finalWhiteId.username;
      } else if (outcome === 'black') {
        winnerId = bet.finalBlackId._id;
        winnerEmail = bet.finalBlackId.email;
        winnerUsername = bet.finalBlackId.username;
      } else {
        continue;
      }

      bet.status = 'won';
      await bet.save();

      const mintResult = await tokenService.mintTokens(winnerId, bet.amount);
      if (mintResult.success) {
        await sendEmail(
          winnerEmail,
          'Bet Won!',
          `Congratulations ${winnerUsername}! You won ${bet.amount} PTK on game ${gameId}.`
        );
      } else {
        console.error(`Failed to mint tokens for user ${winnerId}: ${mintResult.error}`);
      }
    }

    return res.status(200).json({ message: `Processed bets for game ${gameId}`, outcome });
  } catch (error) {
    // Updated error message to match the test expectation
    console.error(`Error fetching game outcome for Game ID ${gameId}:`, error.message);
    const errorMessage = error.response?.data || 'Game not found';
    return res.status(500).json({ error: errorMessage });
  }
};

module.exports = { validateResultHandler };

