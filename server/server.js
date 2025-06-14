const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Chess } = require('chess.js');
const cors = require('cors');
const crypto = require('crypto');

// Replacer function to handle BigInts during JSON.stringify
const bigIntReplacer = (key, value) =>
  typeof value === 'bigint'
    ? value.toString()
    : value; // return everything else unchanged

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://chess-variants-frontend.onrender.com",
  "https://mychessvariants.com" // Added your new frontend domain
];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"],
  credentials: true // Optional: if you plan to use cookies or sessions
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions // Use the same comprehensive corsOptions here
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

const cleanupGame = (roomId) => {
  const game = games[roomId];
  if (!game) return;

  // Clean up disconnect timers for all players in this game
  game.playerIds.forEach(pid => {
    if (game.players[pid] && game.players[pid].disconnectTimer) {
      clearTimeout(game.players[pid].disconnectTimer);
      game.players[pid].disconnectTimer = null;
    }
  });

  // Clean up playerRooms for this game
  for (const sid in playerRooms) {
    if (playerRooms[sid] === roomId) {
      delete playerRooms[sid];
    }
  }

  // Delete the game itself
  delete games[roomId];
  console.log(`Game ${roomId} has been cleaned up and removed from memory.`);
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
        players: {},
        playerIds: [],
        rematchOffers: {}, // Initialize rematch offers for the new room
        gamePhase: 'setup' // Initialize game phase
      };
      const assignedColor = 'w';
      games[roomId].players[newPlayerId] = {
        socketId: socket.id,
        color: assignedColor,
        playerId: newPlayerId,
        secretQueenInitialSquare: null,
        secretQueenCurrentSquare: null,
        secretQueenTransformed: false,
        disconnected: false,
        disconnectTimer: null,
      };
      games[roomId].rematchOffers[newPlayerId] = false; // Initialize rematch offer status for the new player
      games[roomId].playerIds.push(newPlayerId);
      socket.join(roomId);
      playerRooms[socket.id] = roomId;

      socket.emit('gameJoined', {
        roomId,
        playerId: newPlayerId,
        color: assignedColor,
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
      const assignedColor = 'b';
      game.players[newPlayerId] = {
        socketId: socket.id,
        color: assignedColor,
        playerId: newPlayerId,
        secretQueenInitialSquare: null,
        secretQueenCurrentSquare: null,
        secretQueenTransformed: false,
        disconnected: false,
        disconnectTimer: null
      };
      game.rematchOffers[newPlayerId] = false; // Initialize rematch offer status for the new player
      game.playerIds.push(newPlayerId);
      socket.join(roomId);
      playerRooms[socket.id] = roomId;

      // Emit gameJoined specifically to the second player so they know their color and ID
      socket.emit('gameJoined', {
        roomId,
        playerId: newPlayerId,
        color: assignedColor, // This will be 'b'
        fen: game.chess.fen(),
        turn: game.chess.turn()
      });

      // Then emit gameStart to the whole room
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
      // Transition game phase to 'playing' when all Secret Queens are selected
      game.gamePhase = 'playing';
      console.log(`Game ${roomId} phase set to 'playing' - all Secret Queens selected`);
      
      io.to(roomId).emit('allSecretQueensSelected', { 
        players: sanitizePlayersForEmit(game.players),
        gamePhase: 'playing'
      });
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
        game.status = 'ended'; // Mark game as ended
        game.gameOverReason = { status: trueGameStatus }; // Store reason
        console.log(`Game ${roomId} ended due to checkmate/draw. Status marked, data retained for rematch.`);
        // delete games[roomId]; // Deferred: Clean up the game from memory
      }
    }
  }); // End of socket.on('move', ...)

  socket.on('resign', () => {
    console.log(`--- RESIGN EVENT --- Socket: ${socket.id}`);
    const playerInfo = getPlayerInfoBySocketId(socket.id);

    if (!playerInfo) {
      console.log(`Resign event: Player info not found for socket ${socket.id}. Ignoring.`);
      socket.emit('gameError', { type: 'resign_failed', message: 'Could not process resignation. Player not found in a game.' });
      return;
    }

    const { game, player: resigningPlayer, playerId: resigningPlayerId, roomId } = playerInfo;

    if (game.playerIds.length < 2) {
        console.log(`Resign event: Not enough players in room ${roomId} to resign.`);
        socket.emit('gameError', { type: 'resign_failed', message: 'Cannot resign without an opponent.' });
        return;
    }
    
    const winnerColor = resigningPlayer.color === 'w' ? 'b' : 'w';
    const resigningPlayerDisplayColor = resigningPlayer.color === 'w' ? 'White' : 'Black';

    console.log(`Player ${resigningPlayerId} (${resigningPlayer.color}) resigned in room ${roomId}. ${winnerColor === 'w' ? 'White' : 'Black'} wins.`);

    io.to(roomId).emit('gameOver', {
      winner: winnerColor,
      reason: `${resigningPlayerDisplayColor} resigned.`
    });

    game.status = 'ended';
    game.gameOverReason = { winner: winnerColor, reason: `${resigningPlayerDisplayColor} resigned.` };
    console.log(`Game ${roomId} ended due to resignation. Status marked, data retained for rematch.`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const playerInfo = getPlayerInfoBySocketId(socket.id);

    if (playerInfo) {
      const { game, player, playerId, roomId } = playerInfo;

      if (game.status === 'ended') {
        console.log(`Player ${playerId} disconnected from an ended game in room ${roomId}. Cleaning up.`);
        const opponentId = game.playerIds.find(id => id !== playerId);
        if (opponentId && game.players[opponentId] && !game.players[opponentId].disconnected) {
          const opponentSocket = io.sockets.sockets.get(game.players[opponentId].socketId);
          if (opponentSocket) {
            opponentSocket.emit('rematchCancelled', { message: 'Your opponent disconnected. The game has been cleared.' });
          }
        }
        cleanupGame(roomId);
        return;
      }

      player.disconnected = true;
      console.log(`Player ${playerId} (${player.color}) in room ${roomId} has disconnected.`);

      if (game.playerIds.length === 2) {
        const opponentId = game.playerIds.find(id => id !== playerId);
        const opponent = opponentId ? game.players[opponentId] : null;

        if (opponent && opponent.disconnected) {
          console.log(`Both players in room ${roomId} are disconnected. Deleting game.`);
          cleanupGame(roomId);
          return;
        }

        if (opponent && opponent.socketId) {
          io.to(opponent.socketId).emit('playerDisconnected', {
            message: `Your opponent has disconnected. They have a short time to reconnect.`
          });
        }
      }

      const cleanupDelay = 300000; // 5 minutes
      console.log(`Starting 5-minute cleanup timer for player ${playerId} in room ${roomId}.`);
      player.disconnectTimer = setTimeout(() => {
        console.log(`Cleanup timer expired for player ${playerId} in room ${roomId}.`);
        if (games[roomId]) {
            cleanupGame(roomId);
        }
      }, cleanupDelay);
    } else {
        console.log(`Socket ${socket.id} disconnected without being in a game.`);
    }
  });

  socket.on('offerRematch', (data) => {
    console.log(`[offerRematch] Received from socket ${socket.id} with data:`, data);
    const { roomId } = data;
    const playerInfo = getPlayerInfoBySocketId(socket.id);

    if (!playerInfo || playerInfo.roomId !== roomId) {
      console.error('offerRematch: Player info not found or room mismatch.');
      socket.emit('errorGame', { message: 'Error processing rematch offer.' });
      return;
    }

    const { game, playerId } = playerInfo;
    console.log(`[offerRematch] Current game state for room ${playerInfo.roomId} before offer:`, JSON.stringify(game, bigIntReplacer));
    console.log(`[offerRematch] Rematch offers before this one:`, JSON.stringify(game.rematchOffers));

    if (!game || !game.players[playerId] || !game.rematchOffers) {
      console.error('offerRematch: Game or player data incomplete.');
      socket.emit('errorGame', { message: 'Game state error for rematch.' });
      return;
    }

    game.rematchOffers[playerId] = true;
    console.log(`[offerRematch] Player ${playerId} marked as offered. New offers:`, JSON.stringify(game.rematchOffers));
    console.log(`Player ${playerId} in room ${roomId} offered a rematch.`);

    const opponentId = game.playerIds.find(id => id !== playerId);

    if (opponentId && game.players[opponentId] && game.rematchOffers[opponentId]) {
      console.log(`[offerRematch] Condition MET: Both players offered rematch.`);
      // Both players offered a rematch - start a new game
      console.log(`Both players in room ${roomId} offered rematch. Starting new game.`);

      // 1. Swap colors
      const p1OldColor = game.players[playerId].color;
      const p2OldColor = game.players[opponentId].color;
      game.players[playerId].color = p2OldColor;
      game.players[opponentId].color = p1OldColor;

      // 2. Reset Secret Queen data for both players
      [playerId, opponentId].forEach(pId => {
        game.players[pId].secretQueenInitialSquare = null;
        game.players[pId].secretQueenCurrentSquare = null;
        game.players[pId].secretQueenTransformed = false;
      });

      // 3. Reset board and turn
      game.chess = new Chess(); // New game instance

      // 4. Reset rematch offers for the new game
      game.rematchOffers[playerId] = false;
      game.rematchOffers[opponentId] = false;

      // 5. Emit 'startRematchGame' to each player with their specific new data
      const commonNewGameData = {
        roomId,
        fen: game.chess.fen(),
        turn: game.chess.turn(),
        // players: sanitizePlayersForEmit(game.players) // Client expects personalized data
      };

      // Emit to player 1 (current socket)
      console.log(`[offerRematch] Emitting 'startRematchGame' to player ${playerId} (socket ${socket.id}) with color ${game.players[playerId].color}`);
      socket.emit('startRematchGame', {
        ...commonNewGameData,
        playerColor: game.players[playerId].color,
        myPlayerData: sanitizePlayerForEmit(game.players[playerId]),
      });

      // Emit to player 2 (opponent)
      console.log(`[offerRematch] Emitting 'startRematchGame' to opponent ${opponentId} (socket ${game.players[opponentId]?.socketId}) with color ${game.players[opponentId]?.color}`);
      const opponentSocket = io.sockets.sockets.get(game.players[opponentId].socketId);
      if (opponentSocket) {
        opponentSocket.emit('startRematchGame', {
          ...commonNewGameData,
          playerColor: game.players[opponentId].color,
          myPlayerData: sanitizePlayerForEmit(game.players[opponentId]),
        });
      }
      console.log(`Rematch started for room ${roomId}. Players swapped sides.`);

    } else if (opponentId && game.players[opponentId] && game.players[opponentId].socketId) {
      console.log(`[offerRematch] Condition MET: Only current player ${playerId} offered. Notifying opponent ${opponentId}.`);
      // Only current player offered, notify opponent
      const opponentSocket = io.sockets.sockets.get(game.players[opponentId].socketId);
      if (opponentSocket) {
        console.log(`Notifying opponent ${opponentId} in room ${roomId} about rematch offer.`);
        console.log(`[offerRematch] Emitting 'rematchOffered' to opponent ${opponentId} at socket ${game.players[opponentId].socketId}`);
        opponentSocket.emit('rematchOffered', { roomId });
      }
    } else {
      console.log(`Player ${playerId} offered rematch in room ${roomId}, but no opponent found or opponent not connected.`);
      // Optionally, inform the offering player that opponent is not available
      socket.emit('statusUpdate', { message: 'Opponent not available for rematch at the moment.' });
    }
  });

  socket.on('offerDraw', (data) => {
    const { roomId } = data;
    const playerInfo = getPlayerInfoBySocketId(socket.id);
    
    if (!playerInfo || playerInfo.roomId !== roomId) {
      console.error('offerDraw: Player not found or room mismatch.');
      socket.emit('errorGame', { message: 'Invalid room or player data for draw offer.' });
      return;
    }

    const { game, playerId } = playerInfo;
    
    if (game.gamePhase !== 'playing') {
      console.error('offerDraw: Game is not in playing phase.');
      socket.emit('errorGame', { message: 'Cannot offer draw when game is not in progress.' });
      return;
    }

    console.log(`Player ${playerId} in room ${roomId} offered a draw.`);
    console.log(`Game has ${game.playerIds.length} players:`, game.playerIds);
    
    const opponentId = game.playerIds.find(id => id !== playerId);
    console.log(`Found opponent ID: ${opponentId}`);
    
    if (opponentId && game.players[opponentId]) {
      console.log(`Opponent ${opponentId} exists. Socket ID: ${game.players[opponentId].socketId}`);
      console.log(`Opponent connected: ${!game.players[opponentId].disconnected}`);
      
      if (game.players[opponentId].socketId) {
        const opponentSocket = io.sockets.sockets.get(game.players[opponentId].socketId);
        console.log(`Opponent socket found: ${!!opponentSocket}`);
        
        if (opponentSocket) {
          console.log(`Emitting 'drawOffered' to opponent ${opponentId} in room ${roomId}`);
          opponentSocket.emit('drawOffered', { roomId });
          console.log(`Draw offer notification sent successfully`);
        } else {
          console.log(`Opponent socket not found for socket ID: ${game.players[opponentId].socketId}`);
          socket.emit('statusUpdate', { message: 'Opponent not available to receive draw offer at the moment.' });
        }
      } else {
        console.log(`Opponent ${opponentId} has no socket ID`);
        socket.emit('statusUpdate', { message: 'Opponent not connected to receive draw offer.' });
      }
    } else {
      console.log(`Player ${playerId} offered draw in room ${roomId}, but no opponent found or opponent not connected.`);
      console.log(`Available players in game:`, Object.keys(game.players || {}));
      socket.emit('statusUpdate', { message: 'Opponent not available to receive draw offer at the moment.' });
    }
  });

  socket.on('acceptDraw', (data) => {
    const { roomId } = data;
    const playerInfo = getPlayerInfoBySocketId(socket.id);
    
    if (!playerInfo || playerInfo.roomId !== roomId) {
      console.error('acceptDraw: Player not found or room mismatch.');
      socket.emit('errorGame', { message: 'Invalid room or player data for draw acceptance.' });
      return;
    }

    const { game, playerId } = playerInfo;
    
    console.log(`Player ${playerId} in room ${roomId} accepted the draw offer.`);
    
    // End the game in a draw
    game.gamePhase = 'gameOver';
    game.gameResult = 'draw';
    game.gameEndReason = 'Draw by agreement';
    
    // Notify both players that the draw was accepted
    io.to(roomId).emit('drawAccepted', { 
      roomId,
      result: 'draw',
      reason: 'Draw by agreement'
    });
    
    io.to(roomId).emit('gameOver', {
      result: 'draw',
      reason: 'Draw by agreement',
      gamePhase: 'gameOver'
    });
    
    console.log(`Game ${roomId} ended in a draw by mutual agreement.`);
  });

  socket.on('declineDraw', (data) => {
    const { roomId } = data;
    const playerInfo = getPlayerInfoBySocketId(socket.id);
    
    if (!playerInfo || playerInfo.roomId !== roomId) {
      console.error('declineDraw: Player not found or room mismatch.');
      socket.emit('errorGame', { message: 'Invalid room or player data for draw decline.' });
      return;
    }

    const { game, playerId } = playerInfo;
    
    console.log(`Player ${playerId} in room ${roomId} declined the draw offer.`);
    
    const opponentId = game.playerIds.find(id => id !== playerId);
    
    if (opponentId && game.players[opponentId] && game.players[opponentId].socketId) {
      const opponentSocket = io.sockets.sockets.get(game.players[opponentId].socketId);
      if (opponentSocket) {
        console.log(`Notifying opponent ${opponentId} in room ${roomId} that draw was declined.`);
        opponentSocket.emit('drawDeclined', { roomId });
      }
    }
  });

});

app.get('/', (req, res) => {
  res.send('Chess server is running!');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
