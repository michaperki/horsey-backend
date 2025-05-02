// controllers/chessController.js
const { Chess } = require('chess.js');
const Game = require('../models/game');
const logger = require('../utils/logger');
const { getIO } = require('../socket');

/**
 * Start a new chess game
 * @route POST /game/start
 */
exports.startGame = async (req, res) => {
  try {
    const { white, black, timeControl, increment } = req.body;
    
    if (!white || !black) {
      return res.status(400).json({ error: 'White and black players are required' });
    }
    
    // Initialize the chess instance
    const chess = new Chess();
    
    // Create game document in the database
    const game = await Game.create({
      fen: chess.fen(),
      pgn: chess.pgn(),
      players: {
        white,
        black
      },
      timeControl: timeControl || 10,
      increment: increment || 0,
      whiteTime: (timeControl || 10) * 60,
      blackTime: (timeControl || 10) * 60,
      status: 'pending',
      moves: []
    });
    
    const gameId = game._id.toString();
    
    logger.info(`New chess game created via API`, {
      gameId,
      whitePlayer: white,
      blackPlayer: black,
      timeControl,
      increment
    });
    
    res.status(201).json({
      gameId,
      initialFen: chess.fen(),
      initialPgn: chess.pgn(),
      whitePlayer: white,
      blackPlayer: black,
      timeControl: timeControl || 10,
      increment: increment || 0
    });
  } catch (error) {
    logger.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create chess game' });
  }
};

/**
 * Make a move in a chess game
 * @route POST /game/:gameId/move
 */
exports.makeMove = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { move } = req.body;
    
    if (!move) {
      return res.status(400).json({ error: 'Move is required' });
    }
    
    // Find the game in the database
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if the game is still active
    if (game.status !== 'ongoing') {
      return res.status(400).json({ error: 'Game is not active' });
    }
    
    // Initialize chess with current position
    const chess = new Chess(game.fen);
    
    // Try to make the move
    const result = chess.move(move);
    
    if (!result) {
      return res.status(400).json({ error: 'Invalid move' });
    }
    
    // Prepare update data
    const updateData = {
      fen: chess.fen(),
      pgn: chess.pgn(),
      $push: { moves: move }
    };
    
    // Check for game over
    if (chess.isGameOver()) {
      updateData.status = 'finished';
      
      if (chess.isCheckmate()) {
        updateData.outcome = chess.turn() === 'w' ? 'black' : 'white';
        updateData.resultReason = 'checkmate';
      } else if (chess.isDraw()) {
        updateData.outcome = 'draw';
        
        if (chess.isStalemate()) {
          updateData.resultReason = 'stalemate';
        } else if (chess.isThreefoldRepetition()) {
          updateData.resultReason = 'repetition';
        } else if (chess.isInsufficientMaterial()) {
          updateData.resultReason = 'insufficient';
        } else {
          updateData.resultReason = 'draw';
        }
      }
    }
    
    // Update the game in the database
    await Game.findByIdAndUpdate(gameId, updateData);
    
    // Get updated game state to return
    const updatedGame = await Game.findById(gameId);
    
    // Emit the move to connected clients via Socket.IO
    const io = getIO();
    io.to(gameId).emit('chessMoved', {
      move: result,
      fen: chess.fen(),
      pgn: chess.pgn(),
      status: updatedGame.status,
      outcome: updatedGame.outcome,
      gameOver: chess.isGameOver()
    });
    
    // If game is over, emit game over event
    if (chess.isGameOver()) {
      io.to(gameId).emit('gameOver', {
        outcome: updatedGame.outcome,
        reason: updatedGame.resultReason,
        fen: chess.fen(),
        pgn: chess.pgn()
      });
      
      // Also broadcast game finished event for betting logic
      io.emit('gameFinished', {
        gameId,
        outcome: updatedGame.outcome,
        fen: chess.fen(),
        pgn: chess.pgn(),
        reason: updatedGame.resultReason
      });
    }
    
    logger.info(`Move made via API in game ${gameId}`, {
      move,
      fen: chess.fen(),
      gameOver: chess.isGameOver()
    });
    
    // Return the updated state
    res.json({
      fen: chess.fen(),
      pgn: chess.pgn(),
      move: result,
      status: updatedGame.status,
      outcome: updatedGame.outcome,
      gameOver: chess.isGameOver()
    });
  } catch (error) {
    logger.error('Error making move:', error);
    res.status(500).json({ error: 'Failed to make move' });
  }
};

/**
 * Get current state of a chess game
 * @route GET /game/:gameId/state
 */
exports.getState = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    // Find the game in the database
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Return the game state
    res.json({
      fen: game.fen,
      pgn: game.pgn,
      moves: game.moves,
      status: game.status,
      outcome: game.outcome,
      whitePlayer: game.players.white,
      blackPlayer: game.players.black,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      timeControl: game.timeControl,
      increment: game.increment
    });
  } catch (error) {
    logger.error('Error getting game state:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
};

/**
 * Resign a chess game
 * @route POST /game/:gameId/resign
 */
exports.resignGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { color } = req.body;
    
    if (!color || (color !== 'w' && color !== 'b')) {
      return res.status(400).json({ error: 'Valid color (w/b) is required' });
    }
    
    // Find the game in the database
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if the game is still active
    if (game.status !== 'ongoing') {
      return res.status(400).json({ error: 'Game is not active' });
    }
    
    // Update the game as resigned
    const outcome = color === 'w' ? 'black' : 'white';
    
    await Game.findByIdAndUpdate(gameId, {
      status: 'finished',
      outcome,
      resultReason: 'resignation',
      resignedBy: color
    });
    
    // Emit game over event via Socket.IO
    const io = getIO();
    io.to(gameId).emit('gameOver', {
      outcome,
      reason: 'resignation',
      fen: game.fen,
      pgn: game.pgn
    });
    
    // Also broadcast game finished event for betting logic
    io.emit('gameFinished', {
      gameId,
      outcome,
      fen: game.fen,
      pgn: game.pgn,
      reason: 'resignation'
    });
    
    logger.info(`Game ${gameId} resigned by ${color === 'w' ? 'white' : 'black'}`);
    
    res.json({
      gameId,
      outcome,
      reason: 'resignation'
    });
  } catch (error) {
    logger.error('Error resigning game:', error);
    res.status(500).json({ error: 'Failed to resign game' });
  }
};

/**
 * Get recent games
 * @route GET /game/recent
 */
exports.getRecentGames = async (req, res) => {
  try {
    const { limit = 10, offset = 0, status } = req.query;
    
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    const games = await Game.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    const count = await Game.countDocuments(query);
    
    res.json({
      games: games.map(game => ({
        id: game._id,
        whitePlayer: game.players.white,
        blackPlayer: game.players.black,
        status: game.status,
        outcome: game.outcome,
        timeControl: game.timeControl,
        increment: game.increment,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt
      })),
      count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error getting recent games:', error);
    res.status(500).json({ error: 'Failed to get recent games' });
  }
};

/**
 * Get a user's games
 * @route GET /game/user/:userId
 */
exports.getUserGames = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0, status } = req.query;
    
    const query = {
      $or: [
        { 'players.white.id': userId },
        { 'players.black.id': userId }
      ]
    };
    
    if (status) {
      query.status = status;
    }
    
    const games = await Game.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    const count = await Game.countDocuments(query);
    
    res.json({
      games: games.map(game => ({
        id: game._id,
        whitePlayer: game.players.white,
        blackPlayer: game.players.black,
        status: game.status,
        outcome: game.outcome,
        timeControl: game.timeControl,
        increment: game.increment,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt
      })),
      count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error getting user games:', error);
    res.status(500).json({ error: 'Failed to get user games' });
  }
};

/**
 * Add game controllers to your existing routes
 */
module.exports.offerDraw = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { color } = req.body;
    
    if (!color || (color !== 'w' && color !== 'b')) {
      return res.status(400).json({ error: 'Valid color (w/b) is required' });
    }
    
    // Find the game in the database
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if the game is still active
    if (game.status !== 'ongoing') {
      return res.status(400).json({ error: 'Game is not active' });
    }
    
    // Emit draw offer event via Socket.IO
    const io = getIO();
    io.to(gameId).emit('drawOffered', { color });
    
    logger.info(`Draw offered in game ${gameId} by ${color === 'w' ? 'white' : 'black'}`);
    
    res.json({
      gameId,
      drawOfferedBy: color
    });
  } catch (error) {
    logger.error('Error offering draw:', error);
    res.status(500).json({ error: 'Failed to offer draw' });
  }
};

/**
 * Accept or decline a draw offer
 */
module.exports.respondToDraw = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { accepted } = req.body;
    
    // Find the game in the database
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if the game is still active
    if (game.status !== 'ongoing') {
      return res.status(400).json({ error: 'Game is not active' });
    }
    
    const io = getIO();
    
    if (accepted) {
      // Update the game as drawn by agreement
      await Game.findByIdAndUpdate(gameId, {
        status: 'finished',
        outcome: 'draw',
        resultReason: 'agreement',
        drawAgreement: true
      });
      
      // Emit game over event
      io.to(gameId).emit('gameOver', {
        outcome: 'draw',
        reason: 'agreement',
        fen: game.fen,
        pgn: game.pgn
      });
      
      // Also broadcast game finished event for betting logic
      io.emit('gameFinished', {
        gameId,
        outcome: 'draw',
        fen: game.fen,
        pgn: game.pgn,
        reason: 'agreement'
      });
      
      logger.info(`Draw accepted in game ${gameId}`);
      
      res.json({
        gameId,
        outcome: 'draw',
        reason: 'agreement'
      });
    } else {
      // Emit draw declined event
      io.to(gameId).emit('drawDeclined');
      
      logger.info(`Draw declined in game ${gameId}`);
      
      res.json({
        gameId,
        drawDeclined: true
      });
    }
  } catch (error) {
    logger.error('Error responding to draw:', error);
    res.status(500).json({ error: 'Failed to respond to draw' });
  }
};
