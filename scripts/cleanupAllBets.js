// backend/scripts/cleanupAllBets.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Bet = require('../models/Bet');
const connectDB = require('../config/db');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseError } = require('../utils/errorTypes');

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

/**
 * Cleans up (deletes) all bets from the database.
 * Logs details of deleted bets to a timestamped log file.
 * @returns {Promise<Object>} Result of the cleanup operation
 */
async function cleanupAllBets() {
  let connection = null;
  
  try {
    // Connect to the database
    connection = await connectDB();
    
    // Fetch all bets
    const allBets = await Bet.find({});

    if (allBets.length === 0) {
      console.log('No bets found to delete.');
      return { success: true, deletedCount: 0, message: 'No bets found to delete' };
    }

    // Create a log filename with ISO timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `deletedAllBets_${timestamp}.log`;
    const logFilePath = path.join(__dirname, logFileName);
    
    // Create a write stream for logging
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    // Log each bet to be deleted
    allBets.forEach((bet) => {
      logStream.write(`Deleted Bet ID: ${bet._id}, Created At: ${bet.createdAt}, Status: ${bet.status}\n`);
    });

    // Close the log stream
    logStream.end();

    // Delete all bets
    const deleteResult = await Bet.deleteMany({});

    console.log(`Deleted ${deleteResult.deletedCount} bets. Details logged to ${logFilePath}`);

    // Close database connection if opened by this function
    if (mongoose.connection.readyState === 1 && !process.env.KEEP_CONNECTION) {
      await mongoose.connection.close();
    }
    
    return { 
      success: true, 
      deletedCount: deleteResult.deletedCount, 
      logFile: logFilePath 
    };
  } catch (error) {
    console.error('Error during cleanup:', error);
    
    // Close database connection if opened by this function
    if (connection && mongoose.connection.readyState === 1 && !process.env.KEEP_CONNECTION) {
      await mongoose.connection.close();
    }
    
    throw new DatabaseError(`Failed to clean up all bets: ${error.message}`);
  }
}

/**
 * Prompts the user for confirmation before deleting bets
 * @returns {Promise<boolean>} Whether the user confirmed the deletion
 */
function promptForConfirmation() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      'Are you sure you want to delete ALL bets? This action cannot be undone. Type "YES" to confirm: ',
      (answer) => {
        rl.close();
        resolve(answer === 'YES');
      }
    );
  });
}

// Execute the cleanup function if this script is run directly
if (require.main === module) {
  // Ask for confirmation
  promptForConfirmation()
    .then(async (confirmed) => {
      if (confirmed) {
        try {
          const result = await cleanupAllBets();
          console.log('Cleanup completed successfully:', result);
          process.exit(0);
        } catch (error) {
          console.error('Cleanup failed:', error);
          process.exit(1);
        }
      } else {
        console.log('Cleanup operation canceled.');
        process.exit(0);
      }
    });
}

module.exports = cleanupAllBets;
