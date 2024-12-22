// backend/tests/__mocks__/ethers.js
const actualEthers = jest.requireActual('ethers');

const mockContract = {
  mint: jest.fn(),
  balanceOf: jest.fn(),
  transferFrom: jest.fn(),
};

// Mock implementation of Contract
class MockContract {
  constructor(address, abi, signer) {
    this.address = address;
    this.abi = abi;
    this.signer = signer;
  }

  mint = mockContract.mint;
  balanceOf = mockContract.balanceOf;
  transferFrom = mockContract.transferFrom;
}

// Mock implementation of Wallet if needed
class MockWallet {
  constructor(privateKey, provider) {
    this.privateKey = privateKey;
    this.provider = provider;
  }

  // Add any necessary mock methods here
}

// Mock implementation of JsonRpcProvider if needed
const MockJsonRpcProvider = jest.fn().mockImplementation(() => {
  // Mock provider methods if needed
});

// Mock utility functions moved to top-level in v6
const MockUtils = {
  parseUnits: jest.fn((value, decimals) => `${value}`), // Simplistic mock
  formatUnits: jest.fn((value, decimals) => (parseInt(value) / Math.pow(10, decimals)).toString()), // Simplistic mock
};

// Export mocks aligned with v6 API
module.exports = {
  ...actualEthers,
  Contract: MockContract,
  Wallet: MockWallet,
  JsonRpcProvider: MockJsonRpcProvider,
  parseUnits: MockUtils.parseUnits, // Now top-level
  formatUnits: MockUtils.formatUnits, // Now top-level
};
