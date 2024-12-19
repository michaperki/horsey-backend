
// backend/services/tokenService.js
const { ethers, JsonRpcProvider } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Load the ABI
const promoTokenABI = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../abi/PromoToken.json")).toString()
).abi;

// Initialize provider and signer
const provider = new JsonRpcProvider(process.env.POLYGON_RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Initialize contract instance
const promoTokenAddress = process.env.PROMO_TOKEN_ADDRESS;
const promoTokenContract = new ethers.Contract(
  promoTokenAddress,
  promoTokenABI,
  signer
);

module.exports = {
  mintTokens: async (toAddress, amount) => {
    try {
      const tx = await promoTokenContract.mint(
        toAddress,
        ethers.parseUnits(amount.toString(), 18)
      );
      await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (error) {
      console.error("Error minting tokens:", error);
      return { success: false, error: error.message };
    }
  },

  getBalance: async (address) => {
    try {
      const balance = await promoTokenContract.balanceOf(address);
      return { success: true, balance: ethers.formatUnits(balance, 18) };
    } catch (error) {
      console.error("Error fetching balance:", error);
      return { success: false, error: error.message };
    }
  },
  transferTokens: async (fromAddress, toAddress, amount) => {
    try {
      // Assuming the signer has control over fromAddress
      // In reality, transferring from another address requires prior approval

      const tx = await promoTokenContract.transferFrom(
        fromAddress,
        toAddress,
        ethers.utils.parseUnits(amount.toString(), 18)
      );
      await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (error) {
      console.error("Error transferring tokens:", error);
      return { success: false, error: error.message };
    }
  },
};