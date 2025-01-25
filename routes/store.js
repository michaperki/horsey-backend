
const express = require('express');
const Product = require('../models/Product'); // Product model from above

const router = express.Router();

// GET /store/products
router.get('/products', async (req, res) => {
  const { category } = req.query; // Accept optional category filter

  try {
    // Fetch products, optionally filtered by category
    const query = category ? { category } : {};
    const products = await Product.find(query);

    // Check if there are no products
    if (!products || products.length === 0) {
      return res.status(404).json({ message: 'No products available' });
    }

    // Respond with the list of products
    return res.json({
      message: 'Available products',
      products
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

