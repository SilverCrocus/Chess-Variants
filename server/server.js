const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Chess } = require('chess.js');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

app.use(cors({
  origin: "http://localhost:5173"
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

const games = {}; // Stores game state, keyed by roomId
const playerRooms = {}; // Maps socket.id to roomId

const sanitizePlayerForEmit = (player) => {
  if (!player) return null;
  const { disconnectTimer, ...rest } = player;
  return rest;
};

const sanitizePlayersForEmit = (playersObject) => {
  if (!playersObject) return {};
  const sanitized = {};
  for (const playerId in playersObject) {
    sanitized[playerId] = sanitizePlayerForEmit(playersObject[playerId]);
  }
  return sanitized;
};

const getPlayerInfoBySocketId = (socketId) => {
  const roomId = playerRooms[socketId];
  if (!roomId || !games[roomId]) return null;
  const game = games[roomId];
  const playerId = Object.keys(game.players).find(pId => game.players[pId].socketId === socketId);
  if (!playerId) return null;
  return { game, player: game.players[playerId], playerId, roomId };
};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinGame', (data) => {
    const { roomId, playerId: existingPlayerId } = data;
    console.log(`--- JOIN GAME EVENT --- Socket: ${socket.id}, Room: '${roomId}', PlayerID: ${existingPlayerId}`);

    const game = games[roomId];

    if (game && existingPlayerId && game.players[existingPlayerId]) {
      const player = game.players[existingPlayerId];
      if (player.disconnected) {
        console.log(`Player ${existingPlayerId} is reconnecting to room ${roomId} (was disconnected).`);
        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = null;
        }

        player.disconnected = false;
        // Clean up old socket from playerRooms if it exists and is different from the current socket
        const oldSocketId = Object.keys(playerRooms).find(sid => 
          playerRooms[sid] === roomId && 
          games[roomId]?.players[existingPlayerId]?.socketId === sid && 
          sid !== socket.id
        );
        if (oldSocketId) {
            delete playerRooms[oldSocketId];
        }
        
        player.socketId = socket.id;
        playerRooms[socket.id] = roomId;
        socket.join(roomId);

        const opponentId = game.playerIds.find(id => id !== existingPlayerId);
        if (opponentId && game.players[opponentId] && game.players[opponentId].socketId) {
            io.to(game.players[opponentId].socketId).emit('playerReconnected', {
                message: `Your opponent has reconnected. The game resumes.`
            });
        }

        socket.emit('gameRejoined', {
          message: `You have reconnected to the game.`,
          roomId,
          playerId: existingPlayerId,
          color: player.color,
          fen: game.chess.fen(),
          turn: game.chess.turn(),
          players: sanitizePlayersForEmit(game.players),
        });
        return;
      } else { // Player is known, but not marked disconnected - session takeover
        console.log(`Player ${existingPlayerId} is taking over session in room ${roomId} with new socket ${socket.id}. Old socket: ${player.socketId}`);
        
        // Clean up old socket from playerRooms if it exists and is different
        if (player.socketId && player.socketId !== socket.id && playerRooms[player.socketId]) {
          delete playerRooms[player.socketId];
        }

        player.socketId = socket.id; // Update to new socket
        playerRooms[socket.id] = roomId; // Map new socket
        socket.join(roomId);

        // Player was not marked disconnected, so no timer to clear or disconnected flag to change.

        const opponentId = game.playerIds.find(id => id !== existingPlayerId);
        if (opponentId && game.players[opponentId] && game.players[opponentId].socketId) {
            io.to(game.players[opponentId].socketId).emit('playerReconnected', { // Re-using existing event
                message: `Your opponent has re-established connection. The game resumes.`
            });
        }

        socket.emit('gameRejoined', {
          message: `You have re-established your session in the game.`,
          roomId,
          playerId: existingPlayerId,
          color: player.color,
          fen: game.chess.fen(),
          turn: game.chess.turn(),
          players: sanitizePlayersForEmit(game.players),
        });
        return;
      }
    }

    if (!game) {
      const chess = new Chess();
      const newPlayerId = crypto.randomUUID();
      games[roomId] = {
        chess: chess,
        players: {
          [newPlayerId]: {
            playerId: newPlayerId,
            socketId: socket.id,
            color: 'w',
            secretQueenInitialSquare: null,
            secretQueenCurrentSquare: null,
            secretQueenTransformed: false,
            disconnected: false,
            disconnectTimer: null,
          }
        },
        playerIds: [newPlayerId],
      };
      socket.join(roomId);
      playerRooms[socket.id] = roomId;
      socket.emit('gameJoined', {
        roomId,
        playerId: newPlayerId,
        color: 'w',
        fen: chess.fen(),
        turn: chess.turn()
      });
      console.log(`Player ${newPlayerId} (Socket: ${socket.id}) created room ${roomId} as white.`);
    } else if (game.playerIds.length === 1) {
      // Prevent the same socket from being added as the second player
      const firstPlayerId = game.playerIds[0];
      if (game.players[firstPlayerId] && game.players[firstPlayerId].socketId === socket.id) {
        console.warn(`Socket ${socket.id} attempting to join room ${roomId} as a second player, but is already player ${firstPlayerId}. Ignoring.`);
        socket.emit('gameError', { message: 'You are already in this game. Redundant join attempt ignored.' });
        return;
      }

      const newPlayerId = crypto.randomUUID();
      game.players[newPlayerId] = {
        playerId: newPlayerId,
        socketId: socket.id,
        color: 'b',
        secretQueenInitialSquare: null,
        secretQueenCurrentSquare: null,
        secretQueenTransformed: false,
        disconnected: false,
        disconnectTimer: null,
      };
      game.playerIds.push(newPlayerId);
      socket.join(roomId);
      playerRooms[socket.id] = roomId;

      io.to(roomId).emit('gameStart', {
        roomId,
        fen: game.chess.fen(),
        turn: game.chess.turn(),
        players: sanitizePlayersForEmit(game.players),
      });
      console.log(`Player ${newPlayerId} (Socket: ${socket.id}) joined room ${roomId} as black.`);
    } else {
      socket.emit('gameError', { message: 'Room is full or you cannot join at this time.' });
    }
  });

  socket.on('selectSecretQueen', (data) => {
    const { square } = data;
    const playerInfo = getPlayerInfoBySocketId(socket.id);
    if (!playerInfo) { return; }
    const { game, player, roomId } = playerInfo;

    const piece = game.chess.get(square);
    if (!piece || piece.type !== 'p' || piece.color !== player.color ||
      (player.color === 'w' && !square.endsWith('2')) ||
      (player.color === 'b' && !square.endsWith('7'))) {
      socket.emit('gameError', { message: 'Invalid pawn selection for Secret Queen.' });
      return;
    }

    player.secretQueenInitialSquare = square;
    player.secretQueenCurrentSquare = square;

    socket.emit('secretQueenSelected', { square });

    const allPlayersSelected = game.playerIds.every(id => game.players[id].secretQueenInitialSquare);
    if (game.playerIds.length === 2 && allPlayersSelected) {
      io.to(roomId).emit('allSecretQueensSelected', { players: sanitizePlayersForEmit(game.players) });
    }
  });

  socket.on('move', (data) => {
    const { move } = data;
    const playerInfo = getPlayerInfoBySocketId(socket.id);
    if (!playerInfo) {
      socket.emit('gameError', { message: 'Game or player not found for this move.' });
      return;
    }
    const { game, player: playerData, roomId } = playerInfo;

    if (game.chess.turn() !== playerData.color) {
      socket.emit('invalidMove', { message: 'Not your turn.' });
      return;
    }

    let moveResult = null;
    const pieceMoving = game.chess.get(move.from);

    if (
      playerData.secretQueenCurrentSquare === move.from &&
      pieceMoving && pieceMoving.type === 'p' &&
      !playerData.secretQueenTransformed
    ) {
      try {
        moveResult = game.chess.move(move);
        playerData.secretQueenCurrentSquare = move.to;
        if (moveResult.flags.includes('p')) {
          playerData.secretQueenTransformed = true;
        }
      } catch (e) {
        const tempChess = new Chess(game.chess.fen());
        tempChess.remove(move.from);
        tempChess.put({ type: 'q', color: playerData.color }, move.from);

        let queenMoveAttempt = null;
        try {
          queenMoveAttempt = tempChess.move({ from: move.from, to: move.to });
        } catch (err) {
          queenMoveAttempt = null;
        }

        if (queenMoveAttempt) {
          game.chess.remove(move.from);
          game.chess.put({ type: 'q', color: playerData.color }, move.to);
          const fenParts = game.chess.fen().split(' ');
          fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
          if (fenParts[3] !== '-') {
            fenParts[3] = '-';
          }
          game.chess.load(fenParts.join(' '));
          playerData.secretQueenTransformed = true;
          playerData.secretQueenCurrentSquare = move.to;
          moveResult = {
            color: playerData.color, from: move.from, to: move.to, piece: 'p',
            flags: 't', // 't' for custom transform
            promotion: 'q', san: `${move.from}-${move.to}=Q`
          };
        } else {
          if (game.chess.isCheck()) {
            socket.emit('invalidMove', { message: "You're in check. You must make a move to get out of check." });
          } else {
            socket.emit('invalidMove', { message: 'Illegal move for Secret Queen pawn (tried as pawn and queen).' });
          }
          return;
        }
      }
    } else {
      try {
        moveResult = game.chess.move(move);
        if (playerData.secretQueenCurrentSquare === move.from) {
          playerData.secretQueenCurrentSquare = move.to;
        }
      } catch (e) {
        if (game.chess.isCheck()) {
          socket.emit('invalidMove', { message: "You're in check. You must make a move to get out of check." });
        } else {
          socket.emit('invalidMove', { message: 'Illegal move.' });
        }
        return;
      }
    }

    if (moveResult) {
      const analysisChess = new Chess(game.chess.fen());
      for (const playerId in game.players) {
        const playerAnalyzed = game.players[playerId];
        if (playerAnalyzed.secretQueenCurrentSquare && !playerAnalyzed.secretQueenTransformed) {
          const pieceOnMainBoard = game.chess.get(playerAnalyzed.secretQueenCurrentSquare); // Check on the actual game board
          if (pieceOnMainBoard && pieceOnMainBoard.type === 'p' && pieceOnMainBoard.color === playerAnalyzed.color) {
            analysisChess.remove(playerAnalyzed.secretQueenCurrentSquare);
            analysisChess.put({ type: 'q', color: playerAnalyzed.color }, playerAnalyzed.secretQueenCurrentSquare);
          }
        }
      }

      const trueGameStatus = {
        isCheck: analysisChess.isCheck(),
        isCheckmate: analysisChess.isCheckmate(),
        isDraw: analysisChess.isDraw(),
        isStalemate: analysisChess.isStalemate(),
        isThreefoldRepetition: analysisChess.isThreefoldRepetition(),
        isInsufficientMaterial: analysisChess.isInsufficientMaterial()
      };

      io.to(roomId).emit('boardUpdate', {
        fen: game.chess.fen(),
        turn: game.chess.turn(),
        lastMove: moveResult,
        players: sanitizePlayersForEmit(game.players),
        trueGameStatus
      });

      if (trueGameStatus.isCheckmate || trueGameStatus.isDraw) {
        io.to(roomId).emit('gameOver', { status: trueGameStatus });
        delete games[roomId]; // Clean up the game from memory
      }
    }
  }); // End of socket.on('move', ...)

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const playerInfo = getPlayerInfoBySocketId(socket.id);

    if (playerInfo) {
      const { game, player, playerId, roomId } = playerInfo;
      
      player.disconnected = true; // Mark current player as disconnected
      console.log(`Player ${playerId} (${player.color}) in room ${roomId} has disconnected.`);

      // Check if the game is a two-player game and the other player is also disconnected
      if (game.playerIds.length === 2) {
        const opponentId = game.playerIds.find(id => id !== playerId);
        const opponent = opponentId ? game.players[opponentId] : null;

        if (opponent && opponent.disconnected) {
          // Both players are now disconnected. Clean up the game immediately.
          console.log(`Both players in room ${roomId} are disconnected. Deleting game.`);
          
          // Clear any existing timers for both players
          if (player.disconnectTimer) {
            clearTimeout(player.disconnectTimer);
            player.disconnectTimer = null;
          }
          if (opponent.disconnectTimer) {
            clearTimeout(opponent.disconnectTimer);
            opponent.disconnectTimer = null;
          }
          
          delete games[roomId];
          // Clean up playerRooms for this game
          for (const sid in playerRooms) {
              if (playerRooms[sid] === roomId) {
                  delete playerRooms[sid];
              }
          }
          // playerRooms[socket.id] will be deleted by the line at the end of this handler.
          return; // Exit early
        }
      }

      // If we reach here, either it's not a 2-player game where both are disconnected, or the opponent is still connected.
      const opponentIdToNotify = game.playerIds.find(id => id !== playerId);
      if (opponentIdToNotify && game.players[opponentIdToNotify] && !game.players[opponentIdToNotify].disconnected) {
        // Opponent exists and is connected
        io.to(game.players[opponentIdToNotify].socketId).emit('opponentDisconnected', {
          message: 'Your opponent has disconnected. They have 3 minutes to reconnect.'
        });
        
        // Start abandonment timer for the current player
        console.log(`Starting 3-minute abandonment timer for player ${playerId} (${player.color}) in room ${roomId}.`);
        player.disconnectTimer = setTimeout(() => {
          if (games[roomId] && games[roomId].players[playerId]?.disconnected) {
            console.log(`Player ${playerId} (${player.color}) did not reconnect in time. Game in room ${roomId} abandoned.`);
            
            const winnerColorOnTimeout = player.color === 'w' ? 'b' : 'w'; // The other player wins

            io.to(roomId).emit('gameOver', {
              winner: winnerColorOnTimeout,
              reason: `Game abandoned. ${player.color === 'w' ? 'White' : 'Black'} disconnected and did not rejoin.`
            });
            delete games[roomId];
            for (const sid in playerRooms) {
                if (playerRooms[sid] === roomId) {
                    delete playerRooms[sid];
                }
            }
          }
        }, 3 * 60 * 1000); // 3 minutes

      } else if (game.playerIds.length === 1 && game.playerIds[0] === playerId) {
        // This was the only player in the game.
        console.log(`Single player ${playerId} (${player.color}) in room ${roomId} disconnected. Deleting game immediately.`);
        delete games[roomId];
        // playerRooms[socket.id] will be deleted by the line at the end of this handler.
      }
    }
    // Always attempt to clean up the disconnecting socket from playerRooms
    delete playerRooms[socket.id];
  });
});

app.get('/', (req, res) => {
  res.send('Chess server is running!');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
