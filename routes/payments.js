// backend/routes/payments.js
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ValidationError, ResourceNotFoundError, ExternalServiceError } = require('../utils/errorTypes');
const router = express.Router();

// Initialize Stripe with error handling
let stripe;
try {
  const stripeApiKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeApiKey) {
    console.warn("WARNING: STRIPE_SECRET_KEY environment variable not found. Payment features will be limited.");
    stripe = null;
  } else {
    const Stripe = require('stripe');
    stripe = new Stripe(stripeApiKey);
    console.log("Stripe initialized successfully");
  }
} catch (error) {
  console.error("Stripe initialization error:", error.message);
  stripe = null;
}

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
    if (!stripe) {
      throw new ExternalServiceError('Stripe', 'Stripe payments are currently unavailable');
    }
    
    try {
      // For now, just simulate a successful payment
      // In the real implementation, you would create an actual payment intent
      console.log("Simulating Stripe payment success");
      amountPaid = amount;
      
      /* Commented out real implementation for now
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert dollars to cents
        currency: 'usd'
      });
      
      // Check if paymentIntent is successful
      if (paymentIntent.status === 'succeeded') {
        amountPaid = amount;
      } else {
        throw new ExternalServiceError('Stripe', 'Payment failed');
      }
      */
    } catch (error) {
      throw new ExternalServiceError('Stripe', `Payment processing failed: ${error.message}`);
    }
  } else if (paymentMethod === 'crypto') {
    // Mock crypto payment success (For now, simulate success)
    console.log("Simulating crypto payment success");
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
