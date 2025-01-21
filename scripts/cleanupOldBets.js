
// backend/scripts/cleanupOldBets.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Bet = require('../models/Bet');
const connectDB = require('../config/db');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

async function cleanupOldBets() {
  try {
    await connectDB();

    // Define your criteria for "old" bets
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find bets to be deleted
    const betsToDelete = await Bet.find({
      $or: [
        { status: 'expired' },
        { createdAt: { $lt: thirtyDaysAgo } },
      ],
    });

    if (betsToDelete.length === 0) {
      console.log('No old bets found to delete.');
      mongoose.connection.close();
      return;
    }

    // Log deleted bets to a file
    const logFilePath = path.join(__dirname, `deletedBets_${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    betsToDelete.forEach((bet) => {
      logStream.write(`Deleted Bet ID: ${bet._id}, Created At: ${bet.createdAt}, Status: ${bet.status}\n`);
    });

    logStream.end();

    // Delete the bets
    const deleteResult = await Bet.deleteMany({
      _id: { $in: betsToDelete.map((bet) => bet._id) },
    });

    console.log(`Deleted ${deleteResult.deletedCount} old bets. Details logged to ${logFilePath}`);

    mongoose.connection.close();
  } catch (error) {
    console.error('Error during cleanup:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Execute the cleanup function if this script is run directly
if (require.main === module) {
  cleanupOldBets()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = cleanupOldBets;

