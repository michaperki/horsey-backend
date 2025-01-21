
// backend/services/tokenService.js
const { Web3 } = require('web3');
const PromoTokenArtifact = require('../abi/PromoToken.json')
const {
  PROMO_TOKEN_ADDRESS,
  ADMIN_PRIVATE_KEY,
  ADMIN_ADDRESS,
  WEB3_PROVIDER_URL
} = process.env;

console.log("PROMO_TOKEN_ADDRESS", PROMO_TOKEN_ADDRESS);
console.log("WEB3_PROVIDER_URL", WEB3_PROVIDER_URL)

// Initialize Web3
const web3 = new Web3(new Web3.providers.HttpProvider(WEB3_PROVIDER_URL));

// Extract only the ABI array from the artifact
const promoTokenABI = PromoTokenArtifact.abi;

const promoTokenContract = new web3.eth.Contract(promoTokenABI, PROMO_TOKEN_ADDRESS);

/**
 * Mints tokens to a specified address from the admin.
 * @param {string} to - Recipient's blockchain address.
 * @param {number|string} amount - Amount in whole tokens.
 * @returns {Object} - Success status and transaction hash or error message.
 */
async function mintTokens(to, amount) {
  try {
    // Convert amount to smallest unit (assuming 18 decimals)
    const tokenAmount = web3.toWei(amount.toString(), 'ether');

    // Prepare the transaction
    const tx = {
      from: ADMIN_ADDRESS,
      to: PROMO_TOKEN_ADDRESS,
      data: promoTokenContract.methods.mint(to, tokenAmount).encodeABI(),
      gas: await promoTokenContract.methods.mint(to, tokenAmount).estimateGas({ from: ADMIN_ADDRESS }),
    };

    // Sign the transaction
    const signedTx = await web3.eth.accounts.signTransaction(tx, ADMIN_PRIVATE_KEY);

    // Send the transaction
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    return {
      success: true,
      transactionHash: receipt.transactionHash,
    };
  } catch (error) {
    console.error('Error minting tokens:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Transfers tokens from the admin address to a recipient.
 * @param {string} to - Recipient's blockchain address.
 * @param {number|string} amount - Amount of tokens to transfer (in whole tokens).
 * @returns {Object} - Success status and transaction hash or error message.
 */
async function transferTokens(to, amount) {
  try {
    // Validate the recipient address
    if (!web3.isAddress(to)) {
      throw new Error('Invalid recipient address.');
    }

    // Convert amount to token's smallest unit (assuming 18 decimals)
    const tokenAmount = web3.toWei(amount.toString(), 'ether');

    // Check admin's token balance
    const adminBalance = await promoTokenContract.methods.balanceOf(ADMIN_ADDRESS).call();
    if (BigInt(adminBalance) < BigInt(tokenAmount)) {
      throw new Error('Admin wallet has insufficient token balance.');
    }

    // Build transaction data
    const txData = {
      from: ADMIN_ADDRESS,
      to: PROMO_TOKEN_ADDRESS,
      data: promoTokenContract.methods.transfer(to, tokenAmount).encodeABI(),
      gas: 200000, // Adjust based on estimation
    };

    // Sign the transaction
    const signedTx = await web3.eth.accounts.signTransaction(txData, ADMIN_PRIVATE_KEY);

    // Send the transaction
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    return {
      success: true,
      transactionHash: receipt.transactionHash,
    };
  } catch (error) {
    console.error('Error transferring tokens:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves the token balance of a specified address.
 * @param {string} address - Blockchain address to query.
 * @returns {Object} - Success status and balance or error message.
 */
async function getBalance(address) {
  try {
    // Validate Ethereum address
    if (!web3.isAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }

    // Fetch the balance
    const balance = await promoTokenContract.methods.balanceOf(address).call();

    // Convert balance from smallest unit to whole tokens
    const readableBalance = web3.fromWei(balance, 'ether');

    return {
      success: true,
      balance: readableBalance,
    };
  } catch (error) {
    console.error('Error fetching balance:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  mintTokens,
  transferTokens,
  getBalance,
};
