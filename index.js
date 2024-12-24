
// backend/index.js
const app = require('./server');
const connectDB = require('./config/db');
const dotenv = require('dotenv');

dotenv.config();

// Log the environment variables (you can selectively log specific ones if needed)
console.log('Environment Variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MOCK_LICHESS: process.env.MOCK_LICHESS,
});

// Connect to MongoDB only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  connectDB()
    .then(() => {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => {
        console.log(`Backend server is running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
      process.exit(1); // Exit process with failure
    });
}
