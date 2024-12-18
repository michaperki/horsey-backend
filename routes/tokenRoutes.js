const express = require("express");
const router = express.Router();
const tokenService = require("../services/tokenService");

// Route to mint tokens (Admin Only)
router.post("/mint", async (req, res) => {
  const { toAddress, amount } = req.body;

  if (!toAddress || !amount) {
    return res.status(400).json({ error: "toAddress and amount are required" });
  }

  // TODO: Add authentication and authorization to ensure only admins can mint

  const result = await tokenService.mintTokens(toAddress, amount);

  if (result.success) {
    res.json({ message: "Tokens minted successfully", txHash: result.txHash });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Route to get token balance
router.get("/balance/:address", async (req, res) => {
  const { address } = req.params;

  const result = await tokenService.getBalance(address);

  if (result.success) {
    res.json({ address, balance: result.balance });
  } else {
    res.status(500).json({ error: result.error });
  }
});

module.exports = router;
