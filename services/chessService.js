
// services/chessService.js
const { Chess } = require('chess.js');
const { v4: uuidv4 } = require('uuid');

class ChessService {
  constructor() {
    this.games = new Map(); // gameId → Chess() instance
  }

  createGame(playerWhite, playerBlack) {
    const chess = new Chess();
    const gameId = uuidv4();
    this.games.set(gameId, { chess, players: { white: playerWhite, black: playerBlack } });
    return { gameId, initialFen: chess.fen() };
  }

  makeMove(gameId, move) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');
    const result = game.chess.move(move);
    if (!result) throw new Error('Invalid move');
    return { fen: game.chess.fen(), pgn: game.chess.pgn() };
  }

  getGameState(gameId) {
    const game = this.games.get(gameId);
    if (!game) throw new Error('Game not found');
    return {
      fen: game.chess.fen(),
      pgn: game.chess.pgn(),
      turn: game.chess.turn(),
      inCheck: game.chess.in_check(),
      gameOver: game.chess.game_over(),
    };
  }
}

module.exports = new ChessService();
