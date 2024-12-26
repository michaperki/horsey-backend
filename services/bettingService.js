
// backend/services/bettingService.js
const tokenService = require('./tokenService');
const { getGameOutcome } = require('./lichessService');
const Bet = require('../models/Bet');
const User = require('../models/User'); // Assuming User model exists

const processBetOutcome = async (gameId) => {
  // Step 1: Fetch game outcome from Lichess
  const gameResult = await getGameOutcome(gameId);

  if (!gameResult.success) {
    throw new Error(`Failed to fetch game outcome: ${gameResult.error}`);
  }

  const { outcome } = gameResult;

  // Step 2: Retrieve all pending bets associated with this gameId
  const bets = await Bet.find({ gameId, status: 'pending' });

  if (!bets || bets.length === 0) {
    throw new Error('No pending bets found for this game.');
  }

  // Step 3: Determine winners and losers
  const winners = bets.filter(bet => bet.creatorColor === outcome); // Ensure correct condition
  const losers = bets.filter(bet => bet.creatorColor !== outcome);

  // Step 4: Calculate payouts
  const rewardPerWinner = 10; // Define your reward logic here (e.g., fixed amount, percentage)

  for (const winner of winners) {
    // Mint tokens as payout
    const payoutAmount = rewardPerWinner; // Adjust as needed
    const result = await tokenService.mintTokens(winner.creatorId, payoutAmount);

    if (result.success) {
      // Update bet status to 'won'
      winner.status = 'won';
      await winner.save();
    } else {
      console.error(`Failed to mint tokens for user ${winner.creatorId}: ${result.error}`);
      // Optionally, handle the failure (e.g., retry, notify admin)
    }
  }

  // Step 5: Update losers' bet status to 'lost'
  for (const loser of losers) {
    loser.status = 'lost';
    await loser.save();
  }

  return {
    success: true,
    message: `Processed ${winners.length} winning bets and ${losers.length} losing bets for Game ID ${gameId}`,
  };
};

module.exports = { processBetOutcome };

