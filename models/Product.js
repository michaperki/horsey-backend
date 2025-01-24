
const mongoose = require('mongoose');

// Define the schema for a product offering
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  priceInUSD: { type: Number, required: true },
  playerTokens: { type: Number, required: true },
  sweepstakesTokens: { type: Number, required: true },
  description: { type: String, required: true },
  imageFileName: { type: String, required: true }, // New field for image filename
  createdAt: { type: Date, default: Date.now }
});

// Create the Product model from the schema
const Product = mongoose.model('Product', productSchema);
module.exports = Product;

