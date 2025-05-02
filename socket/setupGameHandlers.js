// socket/setupGameHandlers.js
const { Chess } = require('chess.js');
const logger = require('../utils/logger');
const { metrics } = require('../middleware/prometheusMiddleware');

const activeGames    = new Map();
const clockIntervals = new Map();

const setupGameHandlers = (io, socket) => {
  // Called when a player's clock reaches zero
  async function handleTimeout(gameId, color) {
    try {
      stopClockInterval(gameId);
      const gameData = activeGames.get(gameId);
      if (!gameData) return;
      gameData.status = 'finished';
      const outcome = color === 'w' ? 'black' : 'white';

      await Game.findByIdAndUpdate(gameId, {
        status: 'finished',
        outcome,
        timeoutBy: color,
        fen: gameData.game.fen(),
        pgn: gameData.game.pgn()
      });

      io.to(gameId).emit('gameOver', {
        outcome,
        reason: 'timeout',
        fen: gameData.game.fen(),
        pgn: gameData.game.pgn()
      });
      io.emit('gameFinished', { gameId, outcome, fen: gameData.game.fen(), pgn: gameData.game.pgn(), reason: 'timeout' });
      io.to(gameId).emit('clockUpdate', {
        whiteTime: gameData.whiteTime,
        blackTime: gameData.blackTime,
        running: false,
        activeColor: gameData.game.turn()
      });
      metrics.betOperationsTotal.inc({ operation: 'game_finished', status: outcome, currency_type: 'unknown' });
    } catch (error) {
      logger.error('Error handling timeout:', error);
    }
  }

  // Tick clocks every second
  function startClockInterval(gameId) {
    if (clockIntervals.has(gameId)) clearInterval(clockIntervals.get(gameId));
    const interval = setInterval(() => {
      const gameData = activeGames.get(gameId);
      if (!gameData) return clearInterval(interval);
      if (gameData.status === 'ongoing') {
        if (gameData.game.turn() === 'w') {
          gameData.whiteTime = Math.max(0, gameData.whiteTime - 1);
          if (gameData.whiteTime <= 0) return handleTimeout(gameId, 'w');
        } else {
          gameData.blackTime = Math.max(0, gameData.blackTime - 1);
          if (gameData.blackTime <= 0) return handleTimeout(gameId, 'b');
        }
        io.to(gameId).emit('clockUpdate', {
          whiteTime: gameData.whiteTime,
          blackTime: gameData.blackTime,
          running: true,
          activeColor: gameData.game.turn()
        });
      }
    }, 1000);
    clockIntervals.set(gameId, interval);
  }

  function stopClockInterval(gameId) {
    if (clockIntervals.has(gameId)) {
      clearInterval(clockIntervals.get(gameId));
      clockIntervals.delete(gameId);
    }
  }

  // --- Socket event handlers ---
  socket.on('joinChessGame', async ({ gameId }) => {
    logger.info('joinChessGame received', { gameId });

    const Game = require('../models/Game'); // 👈 move here
    try {
      socket.join(gameId);
      if (!activeGames.has(gameId)) {
        const gameData = await Game.findById(gameId);
        if (!gameData) return socket.emit('gameError', { message: 'Game not found' });
        const game = new Chess(gameData.fen || 'start');
        activeGames.set(gameId, {
          game,
          whitePlayer: gameData.players.white,
          blackPlayer: gameData.players.black,
          whiteTime: gameData.whiteTime || 600,
          blackTime: gameData.blackTime || 600,
          increment: gameData.increment || 0,
          lastMoveTime: Date.now(),
          moves: gameData.moves || [],
          activeColor: game.turn(),
          status: gameData.status || 'ongoing'
        });
        if (gameData.status === 'ongoing') startClockInterval(gameId);
      }
      const data = activeGames.get(gameId);
      socket.emit('gameState', {
        fen: data.game.fen(),
        pgn: data.game.pgn(),
        whitePlayer: data.whitePlayer,
        blackPlayer: data.blackPlayer,
        whiteTime: data.whiteTime,
        blackTime: data.blackTime,
        increment: data.increment,
        activeColor: data.activeColor,
        moves: data.moves,
        status: data.status
      });
      io.to(gameId).emit('clockUpdate', {
        whiteTime: data.whiteTime,
        blackTime: data.blackTime,
        running: data.status === 'ongoing',
        activeColor: data.game.turn()
      });
    } catch (error) {
      logger.error('Error joining game:', error);
      socket.emit('gameError', { message: 'Error joining game' });
    }
  });

  socket.on('chessMove', async ({ gameId, move }) => {
    try {
      if (!activeGames.has(gameId)) return socket.emit('gameError', { message: 'Game not found' });
      const data = activeGames.get(gameId);
      if (data.status !== 'ongoing') return socket.emit('gameError', { message: 'Game is already finished' });

      const result = data.game.move(move);
      if (!result) return socket.emit('gameError', { message: 'Invalid move' });

      const now = Date.now();
      const moveTime = now - data.lastMoveTime;
      data.lastMoveTime = now;
      if (result.color === 'w') {
        data.whiteTime = Math.max(0, data.whiteTime - moveTime / 1000) + data.increment;
      } else {
        data.blackTime = Math.max(0, data.blackTime - moveTime / 1000) + data.increment;
      }
      data.activeColor = data.game.turn();
      data.moves.push({ move: result, fen: data.game.fen(), timestamp: now });

      if (data.game.isGameOver()) {
        data.status = 'finished';
        stopClockInterval(gameId);
        let outcome = null;
        if (data.game.isCheckmate()) outcome = data.game.turn() === 'w' ? 'black' : 'white';
        else if (data.game.isDraw()) outcome = 'draw';

        await Game.findByIdAndUpdate(gameId, {
          fen: data.game.fen(),
          pgn: data.game.pgn(),
          status: 'finished',
          outcome,
          whiteTime: data.whiteTime,
          blackTime: data.blackTime,
          $push: { moves: move }
        });

        io.to(gameId).emit('gameOver', {
          outcome,
          reason: data.game.isCheckmate() ? 'checkmate' : 'draw',
          fen: data.game.fen(),
          pgn: data.game.pgn()
        });
        io.emit('gameFinished', { gameId, outcome, fen: data.game.fen(), pgn: data.game.pgn() });
        metrics.betOperationsTotal.inc({ operation: 'game_finished', status: outcome || 'unknown', currency_type: 'unknown' });
      } else {
        await Game.findByIdAndUpdate(gameId, {
          fen: data.game.fen(),
          pgn: data.game.pgn(),
          $push: { moves: move }
        });
      }

      io.to(gameId).emit('chessMoved', {
        move: result,
        fen: data.game.fen(),
        pgn: data.game.pgn(),
        whiteTime: data.whiteTime,
        blackTime: data.blackTime,
        status: data.status,
        outcome: data.status === 'finished' ? data.game.turn() === 'w' ? 'black' : 'white' : null
      });
      io.to(gameId).emit('clockUpdate', {
        whiteTime: data.whiteTime,
        blackTime: data.blackTime,
        running: data.status === 'ongoing',
        activeColor: data.game.turn()
      });
    } catch (error) {
      logger.error('Error making move:', error);
      socket.emit('gameError', { message: 'Error making move: ' + error.message });
    }
  });

  socket.on('resignGame', async ({ gameId, color }) => {
    try {
      if (!activeGames.has(gameId)) return socket.emit('gameError', { message: 'Game not found' });
      const data = activeGames.get(gameId);
      stopClockInterval(gameId);
      data.status = 'finished';
      const outcome = color === 'w' ? 'black' : 'white';

      await Game.findByIdAndUpdate(gameId, {
        status: 'finished',
        outcome,
        resignedBy: color,
        fen: data.game.fen(),
        pgn: data.game.pgn()
      });

      io.to(gameId).emit('gameOver', { outcome, reason: 'resignation', fen: data.game.fen(), pgn: data.game.pgn() });
      io.emit('gameFinished', { gameId, outcome, fen: data.game.fen(), pgn: data.game.pgn(), reason: 'resignation' });
      io.to(gameId).emit('clockUpdate', { whiteTime: data.whiteTime, blackTime: data.blackTime, running: false, activeColor: data.game.turn() });
      metrics.betOperationsTotal.inc({ operation: 'game_finished', status: outcome, currency_type: 'unknown' });
    } catch (error) {
      logger.error('Error resigning game:', error);
      socket.emit('gameError', { message: 'Error resigning game' });
    }
  });

  socket.on('offerDraw', ({ gameId, color }) => {
    io.to(gameId).emit('drawOffered', { color });
  });

  socket.on('respondToDraw', async ({ gameId, accepted }) => {
    try {
      if (!activeGames.has(gameId)) return socket.emit('gameError', { message: 'Game not found' });
      const data = activeGames.get(gameId);
      if (accepted) {
        stopClockInterval(gameId);
        data.status = 'finished';
        await Game.findByIdAndUpdate(gameId, { status: 'finished', outcome: 'draw', drawAgreement: true, fen: data.game.fen(), pgn: data.game.pgn() });
        io.to(gameId).emit('gameOver', { outcome: 'draw', reason: 'agreement', fen: data.game.fen(), pgn: data.game.pgn() });
        io.emit('gameFinished', { gameId, outcome: 'draw', fen: data.game.fen(), pgn: data.game.pgn(), reason: 'agreement' });
        io.to(gameId).emit('clockUpdate', { whiteTime: data.whiteTime, blackTime: data.blackTime, running: false, activeColor: data.game.turn() });
        metrics.betOperationsTotal.inc({ operation: 'game_finished', status: 'draw', currency_type: 'unknown' });
      } else {
        io.to(gameId).emit('drawDeclined');
      }
    } catch (error) {
      logger.error('Error responding to draw:', error);
      socket.emit('gameError', { message: 'Error responding to draw' });
    }
  });

  socket.on('createChessGame', async ({ whitePlayer, blackPlayer, timeControl = 10, increment = 0 }) => {
    try {
      const chess = new Chess();
      const game = await Game.create({
        fen: chess.fen(),
        pgn: chess.pgn(),
        players: { white: whitePlayer, black: blackPlayer },
        timeControl,
        increment,
        whiteTime: timeControl * 60,
        blackTime: timeControl * 60,
        status: 'pending',
        moves: []
      });
      const gameId = game._id.toString();
      activeGames.set(gameId, {
        game: chess,
        whitePlayer,
        blackPlayer,
        whiteTime: timeControl * 60,
        blackTime: timeControl * 60,
        increment,
        lastMoveTime: Date.now(),
        moves: [],
        activeColor: 'w',
        status: 'pending'
      });
      socket.join(gameId);
      socket.emit('chessGameCreated', { gameId, whitePlayer, blackPlayer, initialFen: chess.fen(), timeControl, increment });
      logger.info('New chess game created', { gameId, whitePlayer, blackPlayer, timeControl, increment });
    } catch (error) {
      logger.error('Error creating game:', error);
      socket.emit('gameError', { message: 'Error creating game' });
    }
  });

  socket.on('startChessGame', async ({ gameId }) => {
    try {
      if (!activeGames.has(gameId)) return socket.emit('gameError', { message: 'Game not found' });
      const data = activeGames.get(gameId);
      data.status = 'ongoing';
      data.lastMoveTime = Date.now();
      await Game.findByIdAndUpdate(gameId, { status: 'ongoing' });
      startClockInterval(gameId);
      io.to(gameId).emit('chessGameStarted', {
        gameId,
        fen: data.game.fen(),
        pgn: data.game.pgn(),
        whiteTime: data.whiteTime,
        blackTime: data.blackTime
      });
      logger.info('Chess game started', { gameId });
    } catch (error) {
      logger.error('Error starting game:', error);
      socket.emit('gameError', { message: 'Error starting game' });
    }
  });
};

module.exports = setupGameHandlers;
