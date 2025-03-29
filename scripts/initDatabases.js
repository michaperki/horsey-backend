// scripts/initDatabases.js - Fixed for Atlas connection strings
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const readline = require('readline');

// Helper to create terminal interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt for confirmation
const confirm = (message) => {
  return new Promise((resolve) => {
    rl.question(`${message} (y/n) `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
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

// Create an index safely (check if it exists first)
const createIndexSafely = async (collection, indexSpec, options = {}) => {
  try {
    // Get existing indexes
    const indexes = await collection.indexes();
    
    // Check if index already exists by comparing key fields
    const keyFields = Object.keys(indexSpec);
    const indexExists = indexes.some(idx => {
      // Compare each key in the index
      return keyFields.every(key => 
        idx.key && idx.key[key] === indexSpec[key]
      );
    });
    
    if (indexExists) {
      console.log(`   Index on ${Object.keys(indexSpec).join(', ')} already exists. Skipping.`);
      return;
    }
    
    // Create the index if it doesn't exist
    await collection.createIndex(indexSpec, options);
    console.log(`   Created index on ${Object.keys(indexSpec).join(', ')}`);
  } catch (error) {
    console.error(`   Error creating index: ${error.message}`);
  }
};

// Initialize a database with admin user
const initializeDatabase = async (uri, dbName, adminUsername, adminEmail, adminPassword) => {
  try {
    console.log(`Initializing database: ${dbName}`);
    
    // Check for Atlas connection string and ensure we have a database name
    if (!dbName || dbName === '') {
      if (uri.includes('mongodb+srv')) {
        // For Atlas, we'll use a default name if not specified
        dbName = 'horsey-db';
        console.log(`Using default database name for Atlas: ${dbName}`);
      } else {
        // Try to extract database name from standard connection string
        const urlParts = uri.split('/');
        dbName = urlParts[urlParts.length - 1].split('?')[0];
        if (!dbName) dbName = 'horsey-db';
        console.log(`Using database name from URI: ${dbName}`);
      }
    }
    
    // Connect to the database
    const client = new MongoClient(uri);
    await client.connect();
    console.log(`Connected to MongoDB for ${dbName}`);
    
    const db = client.db(dbName);
    
    // Ensure collections exist
    await Promise.all([
      db.createCollection('users').catch(err => {
        if (err.code !== 48) { // Error 48 = collection already exists
          console.error(`Error creating users collection: ${err.message}`);
        } else {
          console.log('   Users collection already exists');
        }
      }),
      db.createCollection('bets').catch(err => {
        if (err.code !== 48) {
          console.error(`Error creating bets collection: ${err.message}`);
        } else {
          console.log('   Bets collection already exists');
        }
      }),
      db.createCollection('notifications').catch(err => {
        if (err.code !== 48) {
          console.error(`Error creating notifications collection: ${err.message}`);
        } else {
          console.log('   Notifications collection already exists');
        }
      })
    ]);
    
    // Check if admin user collection exists and has any users
    const usersCollection = db.collection('users');
    const adminCount = await usersCollection.countDocuments({ role: 'admin' });
    
    if (adminCount > 0) {
      console.log(`Admin user already exists in ${dbName}. Skipping admin creation.`);
    } else {
      // Create admin user
      const admin = {
        username: adminUsername,
        email: adminEmail,
        password: adminPassword, // This should be hashed in production
        role: 'admin',
        tokenBalance: 5000,
        sweepstakesBalance: 500,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await usersCollection.insertOne(admin);
      console.log(`Admin user '${adminUsername}' created in ${dbName}`);
    }
    
    // Create indexes for better performance
    console.log(`Creating indexes in ${dbName}...`);
    
    // User indexes
    await createIndexSafely(usersCollection, { email: 1 }, { unique: true });
    await createIndexSafely(usersCollection, { username: 1 }, { unique: true });
    await createIndexSafely(usersCollection, { lichessId: 1 }, { unique: true, sparse: true });
    
    // Bet indexes
    const betsCollection = db.collection('bets');
    await createIndexSafely(betsCollection, { creatorId: 1, createdAt: -1 });
    await createIndexSafely(betsCollection, { opponentId: 1, createdAt: -1 });
    await createIndexSafely(betsCollection, { status: 1, createdAt: -1 });
    await createIndexSafely(betsCollection, { gameId: 1 }, { sparse: true });
    await createIndexSafely(betsCollection, { expiresAt: 1 });
    
    // Notification indexes
    const notificationsCollection = db.collection('notifications');
    await createIndexSafely(notificationsCollection, { userId: 1, read: 1 });
    await createIndexSafely(notificationsCollection, { createdAt: -1 });
    
    console.log(`Database ${dbName} initialization complete!`);
    
    // Close the connection
    await client.close();
    
  } catch (error) {
    console.error(`Error initializing ${dbName}:`, error);
    throw error;
  }
};

// Main function to initialize all databases
const initializeAllDatabases = async () => {
  try {
    console.log('🔄 Initializing all databases for different environments...');
    
    // Load environment files
    const devEnv = loadEnvFile('.env');
    const testEnv = loadEnvFile('.env.test');
    const cypressEnv = loadEnvFile('.env.cypress');
    const prodEnv = loadEnvFile('.env.production');
    
    // Get MongoDB URIs
    const devUri = devEnv.MONGODB_URI_DEV || devEnv.MONGODB_URI || 'mongodb://localhost:27017/horsey-dev';
    const testUri = testEnv.MONGODB_URI_TEST || testEnv.MONGODB_URI || 'mongodb://localhost:27017/horsey-test';
    const prodUri = prodEnv.MONGODB_URI_PROD || prodEnv.MONGODB_URI || 'mongodb://localhost:27017/horsey-prod';
    
    // For MongoDB Atlas connections, explicitly set database names rather than trying to extract them
    const isAtlasDev = devUri.includes('mongodb+srv');
    const isAtlasTest = testUri.includes('mongodb+srv');
    const isAtlasProd = prodUri.includes('mongodb+srv');
    
    const devDb = isAtlasDev ? 'horsey-dev' : null;
    const testDb = isAtlasTest ? 'horsey-test' : null;
    const prodDb = isAtlasProd ? 'horsey-prod' : null;
    
    console.log('\nThe following databases will be initialized:');
    console.log(`1. Development: ${devDb || 'horsey-dev'} (${devUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')})`);
    console.log(`2. Test/Cypress: ${testDb || 'horsey-test'} (${testUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')})`);
    console.log(`3. Production: ${prodDb || 'horsey-prod'} (${prodUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')})`);
    
    const shouldContinue = await confirm('\nDo you want to continue?');
    if (!shouldContinue) {
      console.log('Operation canceled.');
      rl.close();
      return;
    }
    
    // Initialize each database
    await initializeDatabase(
      devUri, 
      devDb, 
      devEnv.INITIAL_ADMIN_USERNAME || 'admin_dev',
      devEnv.INITIAL_ADMIN_EMAIL || 'admin_dev@example.com',
      devEnv.INITIAL_ADMIN_PASSWORD || 'password123'
    );
    
    await initializeDatabase(
      testUri, 
      testDb, 
      testEnv.INITIAL_ADMIN_USERNAME || 'admin_test',
      testEnv.INITIAL_ADMIN_EMAIL || 'admin_test@example.com',
      testEnv.INITIAL_ADMIN_PASSWORD || 'password123'
    );
    
    const shouldInitProd = await confirm('\nDo you want to initialize the production database? This should usually be done only once.');
    if (shouldInitProd) {
      await initializeDatabase(
        prodUri, 
        prodDb, 
        prodEnv.INITIAL_ADMIN_USERNAME || 'admin',
        prodEnv.INITIAL_ADMIN_EMAIL || 'admin@example.com',
        prodEnv.INITIAL_ADMIN_PASSWORD || 'secure_password'
      );
    }
    
    console.log('\n✅ All databases initialized successfully!');
    
  } catch (error) {
    console.error('❌ Error initializing databases:', error);
  } finally {
    rl.close();
  }
};

// Run the initialization
initializeAllDatabases();
