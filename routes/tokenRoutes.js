
// backend/routes/tokenRoutes.js
const express = require("express");
const router = express.Router();
const tokenService = require("../services/tokenService");
const { authenticateToken, authorizeRole } = require("../middleware/authMiddleware");
const { getUserBalances } = require('../controllers/userController');
const Bet = require('../models/Bet');
const User = require('../models/User');

// Route to mint tokens (Admin Only)
router.post("/mint", authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { toAddress, amount } = req.body;

  if (!toAddress || !amount) {
    return res.status(400).json({ error: "toAddress and amount are required" });
  }

  try {
    const result = await tokenService.mintTokens(toAddress, amount);

    if (result.success) {
      // Optionally, record the minting action in the database
      res.json({ message: "Tokens minted successfully", txHash: result.txHash });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error minting tokens:', error.message);
    res.status(500).json({ error: 'Server error while minting tokens' });
  }
});

// New Route to get current user's balance
router.get('/balance/user', authenticateToken, getUserBalances);


// Route to get token balance by address (Admin Only)
router.get("/balance/:address", authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { address } = req.params;

  try {
    const result = await tokenService.getBalance(address);

    if (result.success) {
      res.json({ address, balance: result.balance });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error fetching balance:', error.message);
    res.status(500).json({ error: 'Server error while fetching balance' });
  }
});

module.exports = router;
