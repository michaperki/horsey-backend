
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('../models/Product');
const connectDB = require('../config/db');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

/**
 * Populates the store with predefined product offerings.
 */
async function populateStore() {
  try {
    await connectDB();

    // Predefined product offerings with image filenames
    const products = [
      {
        name: 'Basic Token Pack',
        priceInUSD: 10,
        playerTokens: 1000,
        sweepstakesTokens: 100,
        description: 'Get 1000 Player Tokens and 100 Sweepstakes Tokens for $10.',
        imageFileName: 'basic-token-pack.png'
      },
      {
        name: 'Premium Token Pack',
        priceInUSD: 25,
        playerTokens: 2500,
        sweepstakesTokens: 250,
        description: 'Get 2500 Player Tokens and 250 Sweepstakes Tokens for $25.',
        imageFileName: 'premium-token-pack.png'
      },
      {
        name: 'Deluxe Token Pack',
        priceInUSD: 50,
        playerTokens: 5000,
        sweepstakesTokens: 500,
        description: 'Get 5000 Player Tokens and 500 Sweepstakes Tokens for $50.',
        imageFileName: 'deluxe-token-pack.png'
      },
      {
        name: 'Ultimate Token Pack',
        priceInUSD: 100,
        playerTokens: 10000,
        sweepstakesTokens: 1000,
        description: 'Get 10000 Player Tokens and 1000 Sweepstakes Tokens for $100.',
        imageFileName: 'ultimate-token-pack.png'
      }
    ];

    // Insert the predefined products into the Product collection
    const insertResult = await Product.insertMany(products);

    console.log(`Store populated with ${insertResult.length} products.`);

    mongoose.connection.close();
  } catch (error) {
    console.error('Error during population:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Execute the population function if this script is run directly
if (require.main === module) {
  populateStore()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = populateStore;

