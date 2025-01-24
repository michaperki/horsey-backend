
const express = require('express');
const Stripe = require('stripe');
const mongoose = require('mongoose');
const User = require('../models/User'); // Assuming the User model is already defined
const Purchase = require('../models/Purchase'); // Purchase model from above

const router = express.Router();
const stripe = new Stripe('your_stripe_secret_key'); // Replace with actual Stripe secret key

// Helper function to handle payment success and update balances
const handlePaymentSuccess = async (userId, amountPaid, paymentMethod) => {
  const tokensPerDollar = 100;
  const sweepstakesPerDollar = 1;

  const playerTokens = amountPaid * tokensPerDollar;
  const sweepstakesTokens = amountPaid * sweepstakesPerDollar;

  // Find user and update balances
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  user.tokenBalance += playerTokens;
  user.sweepstakesBalance += sweepstakesTokens;

  await user.save();

  // Optional: Create a purchase record
  const purchase = new Purchase({
    userId,
    amountPaid,
    tokensAwarded: playerTokens,
    sweepstakesAwarded: sweepstakesTokens,
    paymentMethod,
    status: 'successful'
  });

  await purchase.save();

  return { playerTokens, sweepstakesTokens };
};

// POST /payments/purchase
router.post('/purchase', async (req, res) => {
  const { userId, paymentMethod, amount } = req.body;

  // Validate input
  if (!userId || !paymentMethod || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  const supportedPaymentMethods = ['stripe', 'crypto'];
  if (!supportedPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Unsupported payment method' });
  }

  try {
    let amountPaid = 0;

    // Mock or simulate a payment based on the payment method
    if (paymentMethod === 'stripe') {
      // Mock: Create a payment intent (In real world, you will initiate a real Stripe payment)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert dollars to cents
        currency: 'usd'
      });

      // Simulate payment success by checking if paymentIntent is successful
      if (paymentIntent.status === 'succeeded') {
        amountPaid = amount; // Set the amount paid as the request amount
      } else {
        throw new Error('Payment failed');
      }
    } else if (paymentMethod === 'crypto') {
      // Mock crypto payment success (For now, simulate success)
      amountPaid = amount;
    }

    // Handle successful payment and update balances
    const { playerTokens, sweepstakesTokens } = await handlePaymentSuccess(userId, amountPaid, paymentMethod);

    return res.json({
      message: 'Payment successful',
      updatedBalances: {
        playerTokens,
        sweepstakesTokens
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
