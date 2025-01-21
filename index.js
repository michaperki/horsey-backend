
// backend/index.js

const http = require('http');
const app = require('./server'); // Ensure this points to your Express app
const connectDB = require('./config/db');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken'); // To verify JWT
const { startTrackingGames } = require('./cron/trackGames'); // Destructure the exported function

dotenv.config();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: [
            'http://localhost:3000',                   // Local development
            'http://localhost:5000',                   // Cypress Test development
            'https://horsey-chess.netlify.app',        // Production frontend
        ],
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Middleware to authenticate Socket.io connections
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        console.error('Socket connection rejected: No token provided');
        return next(new Error('Authentication error: Token required'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded; // Attach user info to socket
        next();
    } catch (err) {
        console.error('Socket connection rejected: Invalid token');
        next(new Error('Authentication error: Invalid token'));
    }
});

// Handle Socket.io connections
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.id}`);

    // Join a room specific to the user for targeted notifications
    socket.join(socket.user.id);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user.id}`);
    });
});

// Make io accessible in your routes/controllers
app.set('io', io);

// Connect to MongoDB and start the server
connectDB()
    .then(() => {
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () => {
            console.log(`Backend server is running on port ${PORT}`);
            // Initialize the cron job
            startTrackingGames(); // Correctly invoke the function
        });
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error.message);
        process.exit(1);
    });

