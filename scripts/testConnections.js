// scripts/testConnections.js - Simplified for three databases
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Load environment variables from each .env file
const loadEnvFile = (filename) => {
  const envPath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    return envConfig;
  }
  return {};
};

// Test connection to a database
const testConnection = async (uri, dbName, color) => {
  console.log(`\n${color}Testing connection to ${dbName}...${colors.reset}`);
  
  try {
    // Connect to the database
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
    });
    
    console.log(`${color}✅ Successfully connected to ${dbName}${colors.reset}`);
    
    // Get database information
    const stats = await mongoose.connection.db.stats();
    console.log(`${color}Database details:${colors.reset}`);
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   Documents: ${stats.objects}`);
    console.log(`   Indexes: ${stats.indexes}`);
    console.log(`   Storage size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`${color}Collections in database:${colors.reset}`);
    collections.forEach(coll => console.log(`   - ${coll.name}`));
    
    // Check users collection
    if (collections.some(c => c.name === 'users')) {
      const usersCollection = mongoose.connection.db.collection('users');
      const userCount = await usersCollection.countDocuments();
      const adminCount = await usersCollection.countDocuments({ role: 'admin' });
      console.log(`   Users: ${userCount} (including ${adminCount} admins)`);
    }
    
    return true;
  } catch (error) {
    console.error(`${colors.red}❌ Failed to connect to ${dbName}:${colors.reset}`, error.message);
    return false;
  } finally {
    // Close the connection if open
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
};

// Main function to test all connections
const testAllConnections = async () => {
  try {
    console.log(`${colors.cyan}===================================${colors.reset}`);
    console.log(`${colors.cyan}Testing Database Connections${colors.reset}`);
    console.log(`${colors.cyan}===================================${colors.reset}`);
    
    // Load environment files
    const devEnv = loadEnvFile('.env');
    const testEnv = loadEnvFile('.env.test');
    const cypressEnv = loadEnvFile('.env.cypress');
    const prodEnv = loadEnvFile('.env.production');
    
    // Get MongoDB URIs
    const devUri = devEnv.MONGODB_URI_DEV || devEnv.MONGODB_URI || 'mongodb://localhost:27017/horsey-dev';
    const testUri = testEnv.MONGODB_URI_TEST || testEnv.MONGODB_URI || 'mongodb://localhost:27017/horsey-test';
    const prodUri = prodEnv.MONGODB_URI_PROD || prodEnv.MONGODB_URI || 'mongodb://localhost:27017/horsey-prod';
    
    // Extract database names from URIs
    const getDbNameFromUri = (uri) => {
      const parts = uri.split('/');
      const dbName = parts[parts.length - 1].split('?')[0];
      return dbName || 'unnamed-db';
    };
    
    const devDb = getDbNameFromUri(devUri);
    const testDb = getDbNameFromUri(testUri);
    const prodDb = getDbNameFromUri(prodUri);
    
    // Test each connection
    const results = [];
    results.push({ env: 'Development', success: await testConnection(devUri, devDb, colors.green) });
    results.push({ env: 'Test/Cypress', success: await testConnection(testUri, testDb, colors.yellow) });
    results.push({ env: 'Production', success: await testConnection(prodUri, prodDb, colors.magenta) });
    
    // Print summary
    console.log(`\n${colors.white}===================================${colors.reset}`);
    console.log(`${colors.white}Connection Test Summary${colors.reset}`);
    console.log(`${colors.white}===================================${colors.reset}`);
    
    results.forEach(result => {
      const statusColor = result.success ? colors.green : colors.red;
      const statusIcon = result.success ? '✅' : '❌';
      console.log(`${statusColor}${statusIcon} ${result.env}: ${result.success ? 'Connected' : 'Failed'}${colors.reset}`);
    });
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n${colors.white}Successfully connected to ${successCount} out of ${results.length} databases.${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}❌ Error testing connections:${colors.reset}`, error);
  }
};

// Run the tests
testAllConnections();
