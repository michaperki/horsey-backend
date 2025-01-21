
// backend/scripts/cleanupAllBets.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Bet = require('../models/Bet');
const connectDB = require('../config/db');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

/**
 * Cleans up (deletes) all bets from the database.
 * Logs details of deleted bets to a timestamped log file.
 */
async function cleanupAllBets() {
  try {
    await connectDB();

    // Fetch all bets
    const allBets = await Bet.find({});

    if (allBets.length === 0) {
      console.log('No bets found to delete.');
      mongoose.connection.close();
      return;
    }

    // Log deleted bets to a file
    const logFileName = `deletedAllBets_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const logFilePath = path.join(__dirname, logFileName);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    allBets.forEach((bet) => {
      logStream.write(`Deleted Bet ID: ${bet._id}, Created At: ${bet.createdAt}, Status: ${bet.status}\n`);
    });

    logStream.end();

    // Delete all bets
    const deleteResult = await Bet.deleteMany({});

    console.log(`Deleted ${deleteResult.deletedCount} bets. Details logged to ${logFilePath}`);

    mongoose.connection.close();
  } catch (error) {
    console.error('Error during cleanup:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Execute the cleanup function if this script is run directly
if (require.main === module) {
  // Optional: Add a confirmation prompt to prevent accidental deletions
  const readline = require('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(
    'Are you sure you want to delete ALL bets? This action cannot be undone. Type "YES" to confirm: ',
    (answer) => {
      if (answer === 'YES') {
        cleanupAllBets()
          .then(() => {
            rl.close();
            process.exit(0);
          })
          .catch(() => {
            rl.close();
            process.exit(1);
          });
      } else {
        console.log('Cleanup operation canceled.');
        rl.close();
        process.exit(0);
      }
    }
  );
}

module.exports = cleanupAllBets;
