// backend/tests/setup.js

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { DatabaseError } = require('../utils/errorTypes');

let replSet;

/**
 * Connects to an in-memory MongoDB instance for testing
 */
module.exports.connect = async () => {
  if (mongoose.connection.readyState === 1) {
    return; // Already connected
  }

  try {
    replSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1, // Single node replica set
        storageEngine: 'wiredTiger', // Ensure using WiredTiger
      }
    });

    const uri = replSet.getUri();

    await mongoose.connect(uri);

    const admin = new mongoose.mongo.Admin(mongoose.connection.db);
    const info = await admin.replSetGetStatus();
    console.log('Replica Set Status:', info);
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw new DatabaseError(`Failed to connect to test database: ${error.message}`);
  }
};

/**
 * Closes the database connection and stops the in-memory MongoDB instance
 */
module.exports.closeDatabase = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
    if (replSet) await replSet.stop();
  } catch (error) {
    console.error('Error closing database:', error);
    throw new DatabaseError(`Failed to close test database: ${error.message}`);
  }
};

/**
 * Clears all collections in the database
 * Useful for resetting the database between tests
 */
module.exports.clearDatabase = async () => {
  if (mongoose.connection.readyState !== 1) {
    throw new DatabaseError('Cannot clear database: No connection established');
  }
  
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    throw new DatabaseError(`Failed to clear test database: ${error.message}`);
  }
};

/**
 * Creates test data in the database
 * @param {Object} options - Options for creating test data
 */
module.exports.seedDatabase = async (options = {}) => {
  const { 
    users = 0,
    bets = 0,
    products = 0
  } = options;
  
  try {
    const User = require('../models/User');
    const Bet = require('../models/Bet');
    const Product = require('../models/Product');
    
    // Create test users
    const testUsers = [];
    for (let i = 0; i < users; i++) {
      const user = new User({
        username: `testUser${i}`,
        email: `test${i}@example.com`,
        password: 'password123',
        tokenBalance: 1000,
        sweepstakesBalance: 100,
        role: i === 0 ? 'admin' : 'user'
      });
      
      await user.save();
      testUsers.push(user);
    }
    
    // Create test bets if we have at least 2 users
    if (testUsers.length >= 2 && bets > 0) {
      for (let i = 0; i < bets; i++) {
        const creatorIndex = i % testUsers.length;
        const opponentIndex = (i + 1) % testUsers.length;
        
        const bet = new Bet({
          creatorId: testUsers[creatorIndex]._id,
          opponentId: testUsers[opponentIndex]._id,
          creatorColor: ['white', 'black', 'random'][i % 3],
          amount: 100 + (i * 10),
          currencyType: i % 2 === 0 ? 'token' : 'sweepstakes',
          timeControl: '5|3',
          status: ['pending', 'matched', 'won', 'lost', 'draw'][i % 5],
          variant: 'standard',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        });
        
        await bet.save();
      }
    }
    
    // Create test products
    if (products > 0) {
      for (let i = 0; i < products; i++) {
        const product = new Product({
          name: `Test Product ${i}`,
          priceInUSD: 10 + (i * 5),
          playerTokens: 1000 * (i + 1),
          sweepstakesTokens: 100 * (i + 1),
          description: `This is test product ${i}`,
          imageFileName: `test-product-${i}.png`,
          category: i % 2 === 0 ? 'Starter Packs' : 'Premium Packs'
        });
        
        await product.save();
      }
    }
    
    return {
      users: testUsers,
      betsCount: bets,
      productsCount: products
    };
  } catch (error) {
    console.error('Error seeding database:', error);
    throw new DatabaseError(`Failed to seed test database: ${error.message}`);
  }
};
