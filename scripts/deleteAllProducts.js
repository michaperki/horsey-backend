
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('../models/Product');
const connectDB = require('../config/db');

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

/**
 * Deletes all products from the database.
 */
async function deleteAllProducts() {
  try {
    await connectDB();

    const result = await Product.deleteMany({});
    console.log(`Deleted ${result.deletedCount} products.`);

    mongoose.connection.close();
  } catch (error) {
    console.error('Error deleting products:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Execute the deletion function if this script is run directly
if (require.main === module) {
  deleteAllProducts()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = deleteAllProducts;
