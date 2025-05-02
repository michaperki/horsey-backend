// backend/socket.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { getStats } = require('./services/statsService');
const logger = require('./utils/logger');
const { metrics } = require('./middleware/prometheusMiddleware');
const chessService = require('./services/chessService');
const setupGameHandlers = require('./socket/setupGameHandlers');

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
  // Get the allowed origins from config
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'https://horsey-chess.netlify.app',
    'https://horsey-dd32bf69ae0e.herokuapp.com',
  ];

  // Log the allowed origins for debugging
  logger.info(`Socket.io initializing with allowed origins:`, { allowedOrigins });

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    // Add transport options to ensure more reliable connections
    transports: ['websocket', 'polling'],
    // Increase ping timeout to handle slower connections
    pingTimeout: 60000,
  });

  ioInstance = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const ip = socket.handshake.address;
    const origin = socket.handshake.headers.origin;
    
    logger.debug(`Socket.io connection attempt`, { 
      ip, 
      socketId: socket.id,
      origin
    });

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
    const origin = socket.handshake.headers.origin;
    logger.info(`Socket connected`, { 
      userId: socket.user.id, 
      socketId: socket.id,
      origin
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

    // Set up game handlers
    setupGameHandlers(io, socket);

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

    // Legacy game events that will be replaced by the new implementation
    socket.on('joinGame', ({ gameId }) => {
      socket.join(gameId);
      socket.emit('joinedGame', { gameId });
    });

    socket.on('startGame', ({ white, black }) => {
      const { gameId, initialFen } = chessService.createGame(white, black);
      socket.join(gameId);
      io.to(gameId).emit('gameStarted', { gameId, initialFen });
    });

    socket.on('makeMove', ({ gameId, move }) => {
      try {
        const state = chessService.makeMove(gameId, move);
        io.in(gameId).emit('moveMade', state);

        // If game over, notify both players and upstream bet logic
        if (state.gameOver) {
          io.in(gameId).emit('gameOver', state);
          io.emit('gameFinished', {
            gameId,
            outcome: state.outcome || null,
            fen: state.fen,
            pgn: state.pgn,
          });
        }
      } catch (err) {
        socket.emit('error', { error: err.message });
      }
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
