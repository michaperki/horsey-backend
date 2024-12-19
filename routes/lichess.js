
// backend/routes/lichess.js
const express = require("express");
const router = express.Router();
const { getGameOutcome } = require("../services/lichessService");
const { processBetOutcome } = require("../services/bettingService");
const { authenticateToken, authorizeAdmin } = require("../middleware/authMiddleware");
const Bet = require('../models/Bet');
const User = require('../models/User'); // Assuming User model exists
const tokenService = require('../services/tokenService'); // Ensure this is correctly imported

// Route to fetch and validate game outcome by Game ID
router.post("/validate-result", authenticateToken, authorizeAdmin, async (req, res) => {
  const { gameId } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: "gameId is required" });
  }

  try {
    // Step 1: Fetch game outcome from Lichess
    const gameResult = await getGameOutcome(gameId);

    if (!gameResult.success) {
      return res.status(500).json({ error: gameResult.error });
    }

    const { outcome, white, black } = gameResult;

    // Step 2: Find all pending bets for this game
    const bets = await Bet.find({ gameId, status: 'pending' });

    if (!bets || bets.length === 0) {
      return res.status(404).json({ error: "No pending bets found for this game" });
    }

    // Step 3: Determine winners and losers
    const winners = bets.filter(bet => bet.choice === outcome);
    const losers = bets.filter(bet => bet.choice !== outcome);

    // Step 4: Define payout logic
    const rewardPerWinner = 10; // Example: 10 PTK per winning bet

    // Step 5: Process payouts for winners
    for (const winner of winners) {
      // Mint tokens as payout
      const payoutAmount = rewardPerWinner;
      const result = await tokenService.mintTokens(winner.userId, payoutAmount);

      if (result.success) {
        // Update bet status to 'won'
        winner.status = 'won';
        await winner.save();
      } else {
        console.error(`Failed to mint tokens for user ${winner.userId}: ${result.error}`);
        // Optionally, handle the failure (e.g., retry, notify admin)
      }
    }

    // Step 6: Update losers' bet status to 'lost'
    for (const loser of losers) {
      loser.status = 'lost';
      await loser.save();
    }

    res.json({
      message: `Processed ${winners.length} winning bets and ${losers.length} losing bets for Game ID ${gameId}`,
      outcome,
      whitePlayer: white,
      blackPlayer: black,
    });
  } catch (error) {
    console.error(`Error validating result for Game ID ${gameId}:`, error.message);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

module.exports = router;

