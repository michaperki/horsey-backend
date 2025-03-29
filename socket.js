// backend/socket.js
//
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { getStats } = require('./services/statsService');
const logger = require('./utils/logger');
const { metrics } = require('./middleware/prometheusMiddleware');

dotenv.config();

let ioInstance;

const broadcastStats = async (io) => {
  const onlineUsers = io.sockets.sockets.size;
  
  // Update active users gauge in Prometheus metrics
  metrics.activeUsersGauge.set(onlineUsers);
  
  const stats = await getStats(onlineUsers);
  io.emit("liveStats", stats);
};

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

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const ip = socket.handshake.address;
    logger.debug(`Socket.io connection attempt`, { ip, socketId: socket.id });

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        logger.info(`Socket authentication successful`, { 
          userId: socket.user.id, 
          socketId: socket.id 
        });
      } catch (err) {
        logger.warn(`Socket authentication failed`, { 
          ip, 
          socketId: socket.id,
          error: err.message 
        });
        return next(new Error('Authentication error: Invalid token'));
      }
    } else {
      logger.debug(`Guest socket connection`, { ip, socketId: socket.id });
      socket.user = { id: `guest-${Math.random().toString(36).substring(2, 9)}` };
    }
    next();
  });

  io.on('connection', async (socket) => {
    logger.info(`Socket connected`, { 
      userId: socket.user.id, 
      socketId: socket.id 
    });
    
    socket.join(socket.user.id);

    // Update active users gauge in Prometheus metrics
    const onlineUsers = io.sockets.sockets.size;
    metrics.activeUsersGauge.set(onlineUsers);
    
    // Emit current stats to the newly connected client
    const stats = await getStats(onlineUsers);
    socket.emit("liveStats", stats);

    // Broadcast updated stats to all clients
    await broadcastStats(io);

    socket.on("getLiveStats", async () => {
      logger.debug(`getLiveStats requested`, { 
        userId: socket.user.id, 
        socketId: socket.id 
      });
      
      socket.emit("liveStats", await getStats(io.sockets.sockets.size));
    });

    socket.on('client_event', (data) => {
      logger.debug(`Received client_event`, { 
        userId: socket.user.id,
        socketId: socket.id,
        eventData: data
      });
    });

    socket.on('gameFinished', async (data) => {
      logger.info(`Game finished event`, { 
        userId: socket.user.id,
        socketId: socket.id,
        gameData: data
      });
      
      // Increment game finished counter in Prometheus metrics
      metrics.betOperationsTotal.inc({
        operation: 'game_finished',
        status: data?.outcome || 'unknown',
        currency_type: data?.currencyType || 'unknown'
      });
      
      await broadcastStats(io);
    });

    socket.on('betPlaced', (data) => {
      logger.info(`Bet placed event`, { 
        userId: socket.user.id,
        socketId: socket.id,
        betData: data
      });
      
      // Increment bet placed counter in Prometheus metrics
      metrics.betOperationsTotal.inc({
        operation: 'place',
        status: 'success',
        currency_type: data?.currencyType || 'unknown'
      });
    });
    
    socket.on('betAccepted', (data) => {
      logger.info(`Bet accepted event`, { 
        userId: socket.user.id,
        socketId: socket.id,
        betData: data
      });
      
      // Increment bet accepted counter in Prometheus metrics
      metrics.betOperationsTotal.inc({
        operation: 'accept',
        status: 'success',
        currency_type: data?.currencyType || 'unknown'
      });
    });

    socket.on('disconnecting', () => {
      const rooms = Array.from(socket.rooms);
      logger.debug(`Socket disconnecting`, { 
        userId: socket.user.id, 
        socketId: socket.id,
        rooms
      });
    });

    socket.on('disconnect', async (reason) => {
      logger.info(`Socket disconnected`, { 
        userId: socket.user.id, 
        socketId: socket.id,
        reason
      });
      
      // Update active users gauge in Prometheus metrics
      metrics.activeUsersGauge.set(io.sockets.sockets.size);
      
      await broadcastStats(io);
    });

    socket.on('error', (error) => {
      logger.error(`Socket error`, { 
        userId: socket.user.id, 
        socketId: socket.id,
        error: error.message,
        stack: error.stack
      });
    });
  });

  io.on('error', (error) => {
    logger.error(`Global Socket.io error`, { 
      error: error.message,
      stack: error.stack
    });
  });

  return io;
};

const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized!');
  }
  return ioInstance;
};

module.exports = { initializeSocket, getIO, broadcastStats };

