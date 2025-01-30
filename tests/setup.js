// backend/tests/setup.js

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replSet;

module.exports.connect = async () => {
  if (mongoose.connection.readyState === 1) {
    return; // Already connected
  }

  replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1, // Single node replica set
      storageEngine: 'wiredTiger', // Ensure using WiredTiger
      // Additional configurations can be added here
    },
    // Optional: Specify MongoDB version if necessary
    // For example, use a stable version that supports transactions well
    // binary: {
    //   version: '6.0.0' // Replace with desired version
    // }
  });

  const uri = replSet.getUri();

  await mongoose.connect(uri);

  const admin = new mongoose.mongo.Admin(mongoose.connection.db);
  const info = await admin.replSetGetStatus();
  console.log('Replica Set Status:', info);
};

module.exports.closeDatabase = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
    if (replSet) await replSet.stop();
  } catch (error) {
    console.error('Error closing database:', error);
  }
};

module.exports.clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

