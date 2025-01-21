
// backend/controllers/adminController.js

const tokenService = require('../services/tokenService');

/**
 * Controller to handle minting tokens.
 */
const mintTokens = async (req, res) => {
  const { to, amount } = req.body;

  // Input validation
  if (!to || !amount) {
    return res.status(400).json({ error: 'Recipient address and amount are required' });
  }

  try {
    const result = await tokenService.mintTokens(to, amount);
    
    if (result.success) {
      res.status(200).json({ message: 'Tokens minted successfully', transactionHash: result.transactionHash });
    } else {
      res.status(500).json({ error: `Failed to mint tokens: ${result.error}` });
    }
  } catch (error) {
    console.error('Error in mintTokens controller:', error);
    res.status(500).json({ error: 'Server error during token minting' });
  }
};

module.exports = { mintTokens };
