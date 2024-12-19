
// backend/routes/tokenRoutes.js
const express = require("express");
const router = express.Router();
const tokenService = require("../services/tokenService");
const { authenticateToken, authorizeAdmin } = require("../middleware/authMiddleware");

// Route to mint tokens (Admin Only)
router.post("/mint", authenticateToken, authorizeAdmin, async (req, res) => {
  const { toAddress, amount } = req.body;

  if (!toAddress || !amount) {
    return res.status(400).json({ error: "toAddress and amount are required" });
  }

  const result = await tokenService.mintTokens(toAddress, amount);

  if (result.success) {
    res.json({ message: "Tokens minted successfully", txHash: result.txHash });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Route to get token balance
router.get("/balance/:address", authenticateToken, authorizeAdmin, async (req, res) => {
  const { address } = req.params;

  const result = await tokenService.getBalance(address);

  if (result.success) {
    res.json({ address, balance: result.balance });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Route to transfer tokens (Admin Only)
router.post("/transfer", authenticateToken, authorizeAdmin, async (req, res) => {
  const { fromAddress, toAddress, amount } = req.body;

  if (!fromAddress || !toAddress || !amount) {
    return res.status(400).json({ error: "fromAddress, toAddress, and amount are required" });
  }

  try {
    const tx = await tokenService.transferTokens(fromAddress, toAddress, amount);
    await tx.wait();
    res.json({ message: "Tokens transferred successfully", txHash: tx.hash });
  } catch (error) {
    console.error("Error transferring tokens:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
