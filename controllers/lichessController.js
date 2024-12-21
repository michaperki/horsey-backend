// backend/controllers/lichessController.js

const { getGameOutcome } = require('../services/lichessService');
const Bet = require('../models/Bet');
const tokenService = require('../services/tokenService');
const { sendEmail } = require('../services/emailService');

const validateResultHandler = async (req, res) => {
  const { gameId } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' });
  }

  try {
    // Fetch the game outcome
    const gameResult = await getGameOutcome(gameId);
    if (!gameResult.success) {
      return res.status(500).json({ error: gameResult.error });
    }

    const { outcome } = gameResult;

    // Find all pending bets for the game and populate user data
    const bets = await Bet.find({ gameId, status: 'pending' }).populate('userId', 'email username');

    if (!bets.length) {
      return res.status(404).json({ error: 'No pending bets found for this game' });
    }

    // Process bets...
    const rewardPerWinner = 10; // Define your reward logic here (e.g., fixed amount, percentage)

    for (const bet of bets) {
      if (bet.choice === outcome) {
        // Winner: Attempt to mint tokens and send email
        const mintResult = await tokenService.mintTokens(bet.userId._id, rewardPerWinner);
        if (mintResult.success) {
          await sendEmail(
            bet.userId.email,
            'Bet Won!',
            `Congratulations ${bet.userId.username}! You won ${rewardPerWinner} PTK on game ${gameId}.`
          );
        } else {
          console.error(`Failed to mint tokens for user ${bet.userId._id}: ${mintResult.error}`);
          // Optionally, handle the failure (e.g., retry, notify admin)
        }
        // **Always** mark the bet as 'won' regardless of minting success
        bet.status = 'won';
        await bet.save();
      } else {
        // Loser: Update bet status
        bet.status = 'lost';
        await bet.save();
      }
    }

    res.json({ message: `Processed bets for game ${gameId}`, outcome });
  } catch (error) {
    console.error(`Error validating result for game ${gameId}:`, error.message);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

module.exports = { validateResultHandler };
