// backend/socket.js
//
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { getStats } = require('./services/statsService');
const { AuthenticationError } = require('./utils/errorTypes');
const logger = require('./utils/logger');

dotenv.config();

let ioInstance;

/**
 * Broadcasts platform statistics to all connected clients
 * @param {Object} io - Socket.io server instance
 */
const broadcastStats = async (io) => {
  try {
    const onlineUsers = io.sockets.sockets.size;
    const stats = await getStats(onlineUsers);
    io.emit("liveStats", stats);
  } catch (error) {
    logger.error('Error broadcasting stats', { error: error.message, stack: error.stack });
  }
};

/**
 * Initializes Socket.io with authentication and event handlers
 * @param {Object} server - HTTP server instance
 * @returns {Object} - Configured Socket.io instance
 */
const initializeSocket = (server) => {
  // Define allowed origins based on environment
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        'https://horsey-chess.netlify.app',
        'https://horsey-dd32bf69ae0e.herokuapp.com'
      ]
    : [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:5000/'
      ];

  // Create Socket.io server with CORS configuration
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  ioInstance = io;

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const ip = socket.handshake.address;
    logger.info('Socket.io connection attempt', { ip });

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        logger.info('Authentication successful', { userId: socket.user.id });
        next();
      } catch (err) {
        logger.error('Authentication failed', { ip, error: err.message });
        next(new AuthenticationError('Authentication error: Invalid token'));
      }
    } else {
      logger.info('No token provided, allowing guest connection', { ip });
      socket.user = { id: `guest-${Math.random().toString(36).substring(2, 9)}` };
      next();
    }
  });

  // Connection event handler
  io.on('connection', async (socket) => {
    logger.info('User connected', { userId: socket.user.id, socketId: socket.id });
    
    // Join user-specific room for targeted messages
    socket.join(socket.user.id);

    // Send initial stats to the new client
    const onlineUsers = io.sockets.sockets.size;
    socket.emit("liveStats", await getStats(onlineUsers));

    // Handle client requests for live stats
    socket.on("getLiveStats", async () => {
      socket.emit("liveStats", await getStats(io.sockets.sockets.size));
    });

    // Broadcast updated stats to all clients on new connection
    await broadcastStats(io);

    // Handle client events
    socket.on('client_event', (data) => {
      logger.info('Received client_event', { userId: socket.user.id, data });
    });

    // Handle game finished events
    socket.on('gameFinished', async () => {
      await broadcastStats(io);
    });

    // Handle disconnecting event
    socket.on('disconnecting', () => {
      logger.info('User disconnecting', { userId: socket.user.id, rooms: [...socket.rooms] });
    });

    // Handle disconnect event
    socket.on('disconnect', async (reason) => {
      logger.info('User disconnected', { userId: socket.user.id, reason });
      await broadcastStats(io);
    });

    // Handle socket errors
    socket.on('error', (error) => {
      logger.error('Error on socket', { socketId: socket.id, userId: socket.user.id, error: error.message });
    });
  });

  // Handle global Socket.io errors
  io.on('error', (error) => {
    logger.error('Global Socket.io error', { error: error.message });
  });

  return io;
};

/**
 * Returns the Socket.io instance
 * @returns {Object} Socket.io instance
 * @throws {Error} If Socket.io is not initialized
 */
const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized!');
  }
  return ioInstance;
};

module.exports = { initializeSocket, getIO, broadcastStats };

