
// backend/cron/trackGames.js

const cron = require('node-cron');
const Bet = require('../models/Bet');
const { getGameOutcome } = require('../services/lichessService');
const { sendEmail } = require('../services/emailService');
const { sendNotification } = require('../services/notificationService');
const User = require('../models/User');

/**
 * Starts the cron job to track and process game outcomes.
 */
function startTrackingGames() {
  // Schedule this job to run every minute
  cron.schedule('* * * * *', async () => {
    try {
      console.log('Cron Job: Checking for concluded games...');

      // Fetch all bets with status 'matched' and a valid gameId
      const matchedBets = await Bet.find({
        status: 'matched',
        gameId: { $ne: null }
      })
      .populate('creatorId') // Populate creatorId to access lichessUsername
      .populate('opponentId'); // Populate opponentId to access lichessUsername

      console.log(`Found ${matchedBets.length} matched bets to process.`);

      for (const bet of matchedBets) {
        const gameId = bet.gameId;

        // Get outcome from Lichess
        const gameResult = await getGameOutcome(gameId);
        if (!gameResult.success) {
          // If the game is not done yet, skip
          console.log(`Game ID ${gameId} not concluded yet or error: ${gameResult.error}`);
          continue;
        }

        const { outcome, whiteUsername, blackUsername } = gameResult;

        // Map Lichess usernames to your user accounts
        const whiteUser = await User.findOne({ lichessUsername: whiteUsername });
        const blackUser = await User.findOne({ lichessUsername: blackUsername });

        if (!whiteUser || !blackUser) {
          console.error(`Could not find user accounts for game ID ${gameId}. White: ${whiteUsername}, Black: ${blackUsername}`);
          continue;
        }

        // Assign finalWhiteId and finalBlackId
        bet.finalWhiteId = whiteUser._id;
        bet.finalBlackId = blackUser._id;

        if (outcome === 'draw') {
          // Handle draw
          bet.status = 'draw';
          bet.winnerId = null;
          await bet.save();

          // Refund both players
          whiteUser.balance += bet.amount;
          blackUser.balance += bet.amount;
          await whiteUser.save();
          await blackUser.save();

          console.log(`Game ID ${gameId} ended in a draw. Bet marked as draw. Refunded both players.`);
          continue;
        }

        // Identify Winner
        let winnerUser;
        if (outcome === 'white') {
          winnerUser = whiteUser;
        } else if (outcome === 'black') {
          winnerUser = blackUser;
        }

        if (!winnerUser) {
          console.error(`Winner user not found for bet ID ${bet._id}.`);
          continue;
        }

        // Calculate pot
        const pot = bet.amount * 2;

        // Update bet status and winnerId
        bet.status = 'won';
        bet.winnerId = winnerUser._id;
        await bet.save();

        // Update winner's off-chain balance
        winnerUser.balance += pot;
        await winnerUser.save();

        // Send notification email
        await sendEmail(
          winnerUser.email,
          'Bet Won!',
          `Congrats ${winnerUser.username}! You won ${pot} PTK on game ${gameId}.`
        );

        await sendNotification(
          winnerUser._id,
          `Congrats! You won ${pot} tokens on game ${bet.gameId}.`,
          'tokensWon'
        );

        console.log(`User ${winnerUser.username} won ${pot} PTK on game ${gameId}.`);
      }

      console.log('Cron Job: Game outcome processing completed.');
    } catch (error) {
      console.error('Cron Job Error:', error.message);
    }
  });
}

module.exports = { startTrackingGames };

