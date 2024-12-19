// backend/controllers/lichessController.js
const Bet = require('../models/Bet'); // Assuming you have a Bet model
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const tokenService = require('../services/tokenService'); // Assuming you have a tokenService

// Handler for validating game results
const validateResultHandler = async (req, res) => {
  const { gameId } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' });
  }

  try {
    // Implement your logic to get the game outcome
    const gameResult = await getGameOutcome(gameId); // You need to define this function
    if (!gameResult.success) {
      return res.status(500).json({ error: gameResult.error });
    }

    const { outcome } = gameResult;

    // Find all pending bets for the game
    const bets = await Bet.find({ gameId, status: 'pending' });

    if (!bets.length) {
      return res.status(404).json({ error: 'No pending bets found for this game' });
    }

    // Process each bet based on the outcome
    for (const bet of bets) {
      if (bet.choice === outcome) {
        // Winner logic
        const payout = 10; // Define your payout logic
        const mintResult = await tokenService.mintTokens(bet.userId, payout);

        if (mintResult.success) {
          bet.status = 'won';
          await bet.save();

          // Send email notification
          const user = await User.findById(bet.userId);
          if (user && user.notificationPreferences.email) {
            await sendEmail(
              user.email,
              'Bet Won!',
              `Congratulations ${user.username}! You won ${payout} PTK on game ${gameId}.`
            );
          }
        } else {
          console.error(`Failed to mint tokens for user ${bet.userId}: ${mintResult.error}`);
        }
      } else {
        // Loser logic
        bet.status = 'lost';
        await bet.save();

        // Send email notification
        const user = await User.findById(bet.userId);
        if (user && user.notificationPreferences.email) {
          await sendEmail(
            user.email,
            'Bet Lost',
            `Sorry ${user.username}, you lost your bet of ${bet.amount} PTK on game ${gameId}. Better luck next time!`
          );
        }
      }
    }

    res.json({ message: `Processed bets for game ${gameId}`, outcome });
  } catch (error) {
    console.error(`Error validating result for game ${gameId}:`, error.message);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const getGameOutcome = async (gameId) => {
  // Implement the logic to fetch game outcome
  // This is a placeholder function
  // Return an object like { success: true, outcome: 'white' }
  try {
    // Fetch game data from Lichess API or your database
    const outcome = 'white'; // Example outcome
    return { success: true, outcome };
  } catch (error) {
    return { success: false, error: 'Failed to fetch game outcome' };
  }
};

module.exports = { validateResultHandler, getGameOutcome };
