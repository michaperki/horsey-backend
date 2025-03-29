// This script initializes the MongoDB database with proper authentication
// It will be executed when the MongoDB container starts for the first time

// Create admin user (if not already exists)
db = db.getSiblingDB('admin');
db.createUser({
  user: process.env.MONGO_INITDB_ROOT_USERNAME,
  pwd: process.env.MONGO_INITDB_ROOT_PASSWORD,
  roles: [{ role: 'root', db: 'admin' }]
});

// Switch to app database and create app user
db = db.getSiblingDB('horsey');
db.createUser({
  user: process.env.MONGO_APP_USERNAME || 'horsey_user',
  pwd: process.env.MONGO_APP_PASSWORD || 'horsey_password',
  roles: [{ role: 'readWrite', db: 'horsey' }]
});

// Create collections
db.createCollection('users');
db.createCollection('bets');
db.createCollection('notifications');
db.createCollection('products');
db.createCollection('purchases');

// Create indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ lichessId: 1 }, { unique: true, sparse: true });

db.bets.createIndex({ creatorId: 1, createdAt: -1 });
db.bets.createIndex({ opponentId: 1, createdAt: -1 });
db.bets.createIndex({ status: 1, createdAt: -1 });
db.bets.createIndex({ gameId: 1 }, { sparse: true });
db.bets.createIndex({ expiresAt: 1 });

db.notifications.createIndex({ userId: 1, read: 1 });
db.notifications.createIndex({ createdAt: -1 });

print('MongoDB initialization completed successfully!');
