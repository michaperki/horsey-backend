
// backend/socket.js

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

let ioInstance;

/**
 * Initializes the Socket.io server.
 * @param {http.Server} server - The HTTP server instance.
 * @returns {Server} - The initialized Socket.io server.
 */
const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://localhost:5000',
        'https://horsey-chess.netlify.app',
        'https://horsey-dd32bf69ae0e.herokuapp.com',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  ioInstance = io;

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

  return io;
};

/**
 * Retrieves the initialized Socket.io instance.
 * @returns {Server} - The Socket.io server instance.
 */
const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized!');
  }
  return ioInstance;
};

module.exports = { initializeSocket, getIO };
