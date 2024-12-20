
// backend/routes/payments.js
const express = require('express');
const router = express.Router();

// Mock Stripe payment intent
router.post('/stripe', async (req, res) => {
  const { amount, currency } = req.body;
  // Simulate a successful payment intent
  res.send({ clientSecret: 'mock_client_secret' });
});

// Mock Crypto transaction
router.post("/crypto", async (req, res) => {
  // Simulate a successful crypto transaction
  res.send({ transactionId: 'mock_transaction_id' });
});

module.exports = router;

