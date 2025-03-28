// backend/routes/store.js

const express = require('express');
const Product = require('../models/Product');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ResourceNotFoundError } = require('../utils/errorTypes');

const router = express.Router();

// GET /store/products
router.get('/products', asyncHandler(async (req, res) => {
  const { category } = req.query; // Accept optional category filter

  // Fetch products, optionally filtered by category
  const query = category ? { category } : {};
  const products = await Product.find(query);

  // Check if there are no products
  if (!products || products.length === 0) {
    throw new ResourceNotFoundError('Products', { category });
  }

  // Respond with the list of products
  return res.json({
    message: 'Available products',
    products
  });
}));

// GET /store/product/:id
router.get('/product/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const product = await Product.findById(id);
  
  if (!product) {
    throw new ResourceNotFoundError('Product');
  }
  
  return res.json({
    product
  });
}));

// GET /store/categories
router.get('/categories', asyncHandler(async (req, res) => {
  // Get unique categories from the product collection
  const categories = await Product.distinct('category');
  
  return res.json({
    categories
  });
}));

module.exports = router;
