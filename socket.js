
// backend/socket.js

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { getStats } = require('./services/statsService');

dotenv.config();

let ioInstance;

const broadcastStats = async (io) => {
  const onlineUsers = io.sockets.sockets.size;
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
    console.log(`Socket.io connection attempt from IP: ${ip}`);

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        console.log(`Authentication successful for user ID: ${socket.user.id}`);
      } catch (err) {
        console.error(`Authentication failed from IP: ${ip}: ${err.message}`);
        return next(new Error('Authentication error: Invalid token'));
      }
    } else {
      console.log(`No token provided, allowing guest connection from IP: ${ip}`);
      socket.user = { id: `guest-${Math.random().toString(36).substring(2, 9)}` };
    }
    next();
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ID=${socket.user.id}, SocketID=${socket.id}`);
    socket.join(socket.user.id);

    const onlineUsers = io.sockets.sockets.size;
    socket.emit("liveStats", await getStats(onlineUsers));

    socket.on("getLiveStats", async () => {
      socket.emit("liveStats", await getStats(io.sockets.sockets.size));
    });

    await broadcastStats(io);

    socket.on('client_event', (data) => {
      console.log(`Received 'client_event' from User ID=${socket.user.id}:`, data);
    });

    socket.on('gameFinished', async () => {
      // Assume Bet updates are handled elsewhere.
      await broadcastStats(io);
    });

    socket.on('disconnecting', () => {
      console.log(`User ID=${socket.user.id} is disconnecting from rooms: ${[...socket.rooms]}`);
    });

    socket.on('disconnect', async (reason) => {
      console.log(`User disconnected: ID=${socket.user.id}, Reason: ${reason}`);
      await broadcastStats(io);
    });

    socket.on('error', (error) => {
      console.error(`Error on socket ID=${socket.id} for User ID=${socket.user.id}:`, error);
    });
  });

  io.on('error', (error) => {
    console.error('Global Socket.io error:', error);
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
