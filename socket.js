
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
    // Additional options can be added here
  });

  ioInstance = io;

  // Middleware to authenticate Socket.io connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const ip = socket.handshake.address;
    console.log(`Socket.io connection attempt from IP: ${ip}`);

    if (!token) {
      console.error(`Authentication failed: No token provided. IP: ${ip}`);
      return next(new Error('Authentication error: Token required'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // Attach user info to socket
      console.log(`Authentication successful for user ID: ${socket.user.id}`);
      next();
    } catch (err) {
      console.error(`Authentication failed: Invalid token from IP: ${ip}. Error: ${err.message}`);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle Socket.io connections
  io.on('connection', (socket) => {
    console.log(`User connected: ID=${socket.user.id}, SocketID=${socket.id}`);

    // Join a room specific to the user for targeted notifications
    socket.join(socket.user.id);
    console.log(`User ID=${socket.user.id} joined room: ${socket.user.id}`);

    // Optional: Listen to custom events for additional debugging
    socket.on('client_event', (data) => {
      console.log(`Received 'client_event' from User ID=${socket.user.id}:`, data);
      // Handle the event as needed
    });

    socket.on('disconnecting', () => {
      console.log(`User ID=${socket.user.id} is disconnecting from rooms: ${[...socket.rooms]}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ID=${socket.user.id}, Reason: ${reason}`);
    });

    socket.on('error', (error) => {
      console.error(`Error on socket ID=${socket.id} for User ID=${socket.user.id}:`, error);
    });
  });

  // Handle global Socket.io errors
  io.on('error', (error) => {
    console.error('Global Socket.io error:', error);
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

