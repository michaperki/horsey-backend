// backend/routes/payments.js

const express = require('express');
const Stripe = require('stripe');
const mongoose = require('mongoose');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ValidationError, ResourceNotFoundError, ExternalServiceError } = require('../utils/errorTypes');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // Use environment variable

// Helper function to handle payment success and update balances
const handlePaymentSuccess = async (userId, amountPaid, paymentMethod) => {
  const tokensPerDollar = 100;
  const sweepstakesPerDollar = 1;

  const playerTokens = amountPaid * tokensPerDollar;
  const sweepstakesTokens = amountPaid * sweepstakesPerDollar;

  // Find user and update balances
  const user = await User.findById(userId);
  if (!user) {
    throw new ResourceNotFoundError('User');
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
router.post('/purchase', asyncHandler(async (req, res) => {
  const { userId, paymentMethod, amount } = req.body;

  // Validate input
  if (!userId || !paymentMethod || !amount) {
    throw new ValidationError('Missing required fields');
  }

  if (amount <= 0) {
    throw new ValidationError('Amount must be greater than 0');
  }

  const supportedPaymentMethods = ['stripe', 'crypto'];
  if (!supportedPaymentMethods.includes(paymentMethod)) {
    throw new ValidationError(`Unsupported payment method. Supported methods: ${supportedPaymentMethods.join(', ')}`);
  }

  let amountPaid = 0;

  // Mock or simulate a payment based on the payment method
  if (paymentMethod === 'stripe') {
    try {
      // Mock: Create a payment intent (In real world, you will initiate a real Stripe payment)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert dollars to cents
        currency: 'usd'
      });

      // Simulate payment success by checking if paymentIntent is successful
      if (paymentIntent.status === 'succeeded') {
        amountPaid = amount; // Set the amount paid as the request amount
      } else {
        throw new ExternalServiceError('Stripe', 'Payment failed');
      }
    } catch (error) {
      throw new ExternalServiceError('Stripe', `Payment processing failed: ${error.message}`);
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
}));

// GET /payments/history
router.get('/history', asyncHandler(async (req, res) => {
  const { userId } = req.query;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new ValidationError('Valid userId is required');
  }

  const purchases = await Purchase.find({ userId }).sort({ createdAt: -1 });

  res.json({
    purchases,
    total: purchases.length
  });
}));

module.exports = router;
