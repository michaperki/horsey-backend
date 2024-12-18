// backend/routes/payments.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { ethers } = require('ethers');

// Create a payment intent
router.post('/stripe', async (req, res) => {
  const { amount, currency } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Placeholder for Crypto transactions
router.post("/crypto", async (req, res) => {
  // Implement crypto transaction logic here
  res.send("Crypto payment endpoint");
});

module.exports = router;
