
// backend/index.js

const http = require('http');
const app = require('./server'); // Import the Express app
const connectDB = require('./config/db');
const dotenv = require('dotenv');
const { initializeSocket } = require('./socket'); // Import initializeSocket
const jwt = require('jsonwebtoken'); // To verify JWT
const { startTrackingGames } = require('./cron/trackGames'); // Destructure the exported function
const seedAdmin = require('./scripts/seedAdmin'); // Ensure correct path

dotenv.config();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with enhanced logging
const io = initializeSocket(server);

// Make io accessible in your routes/controllers via app locals
app.set('io', io);

// Connect to MongoDB and start the server
connectDB()
  .then(async () => {
    console.log('MongoDB connected successfully.');

    // Seed the admin user after successful DB connection
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'cypress') {
      await seedAdmin();
      console.log('Admin user seeded successfully.');
    }

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Backend server is running on port ${PORT}`);
      // Initialize the cron job
      startTrackingGames(); // Correctly invoke the function
      require('./cron/resetStats'); // schedules the reset stats job

      console.log('Cron jobs for tracking games and resetting stats started.');
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB or seed admin:', error);
    process.exit(1); // Exit the process with failure
  });

module.exports = server; // Export the server for testing and other purposes

