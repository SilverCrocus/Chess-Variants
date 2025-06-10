const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Chess } = require('chess.js');
const cors = require('cors');

const app = express();

// Use CORS middleware for all incoming requests
app.use(cors({
  origin: "http://localhost:5173"
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Explicitly allow the frontend origin
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

const games = {}; // Stores game state: { roomId: { chess: ChessInstance, players: { socketId1: 'w', socketId2: 'b' }, playerSockets: [socketId1, socketId2] }}
const playerRooms = {}; // Maps socket.id to roomId: { socketId: roomId }

app.get('/', (req, res) => {
  res.send('Chess server is running!');
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinGame', (roomId) => {
    // New detailed logging:
    console.log(`\n--- JOIN GAME EVENT ---`);
    console.log(`Socket ID: ${socket.id}`);
    console.log(`Requested Room ID: '${roomId}' (Type: ${typeof roomId}, Length: ${roomId.length})`);
    console.log(`Current game room IDs before processing: [${Object.keys(games).join(', ')}]`);
    console.log(`Does games['${roomId}'] exist before processing? ${!!games[roomId]}`);
    if (games[roomId]) {
      console.log(`games['${roomId}'].playerSockets before processing: [${games[roomId].playerSockets.join(', ')}]`);
      console.log(`games['${roomId}'].playerSockets.length before processing: ${games[roomId].playerSockets.length}`);
    }
    // End of new detailed logging

    if (!games[roomId]) {
      // First player to join this roomId
      const chess = new Chess();
      games[roomId] = {
        chess: chess,
        players: { [socket.id]: 'w' }, // Assign first player to white
        playerSockets: [socket.id],    // Store socket IDs
      };
      socket.join(roomId);
      playerRooms[socket.id] = roomId;
      socket.emit('gameJoined', { roomId, color: 'w', fen: chess.fen(), turn: chess.turn() });
      console.log(`Player ${socket.id} created and joined room ${roomId} as white.`);
    } else if (games[roomId] && games[roomId].playerSockets.length === 1) {
      // Second player to join
      if (games[roomId].playerSockets.includes(socket.id)) {
           socket.emit('gameError', { message: 'You are already in this game.' });
           return;
      }
      games[roomId].players[socket.id] = 'b'; // Assign second player to black
      games[roomId].playerSockets.push(socket.id);
      socket.join(roomId);
      playerRooms[socket.id] = roomId;
      
      const game = games[roomId];
      // Notify both players that the game can start
      io.to(roomId).emit('gameStart', { 
        roomId, 
        fen: game.chess.fen(), 
        turn: game.chess.turn(), 
        players: game.players 
      });
      console.log(`Player ${socket.id} joined room ${roomId} as black. Game starting.`);
    } else {
      // Room is full or in an invalid state
      socket.emit('gameError', { message: 'Room is full or cannot be joined.' });
      console.log(`Player ${socket.id} failed to join room ${roomId}.`);
    }
  });

  socket.on('move', (data) => {
    const { roomId, move } = data; // move should be { from: 'e2', to: 'e4', promotion: 'q' (optional) }
    const game = games[roomId];

    if (!game) {
      socket.emit('gameError', { message: 'Game not found.' });
      return;
    }

    const playerColor = game.players[socket.id];
    if (!playerColor) {
      socket.emit('gameError', { message: 'You are not a player in this game.' });
      return;
    }

    if (game.chess.turn() !== playerColor) {
      socket.emit('invalidMove', { message: 'Not your turn.' });
      return;
    }

    try {
      const result = game.chess.move(move);
      if (result) {
        io.to(roomId).emit('boardUpdate', { 
          fen: game.chess.fen(), 
          turn: game.chess.turn(),
          lastMove: result // Contains from, to, color, piece, san, flags etc.
        });

        if (game.chess.isGameOver()) {
          let status = 'Game Over';
          let winner = null; // null for draw
          if (game.chess.isCheckmate()) {
            status = 'Checkmate';
            winner = game.chess.turn() === 'w' ? 'b' : 'w'; // The player whose turn it ISN'T (the one who delivered checkmate)
          } else if (game.chess.isDraw()) {
            status = 'Draw';
            if (game.chess.isStalemate()) status = 'Stalemate';
            else if (game.chess.isThreefoldRepetition()) status = 'Threefold Repetition';
            else if (game.chess.isInsufficientMaterial()) status = 'Insufficient Material';
          }
          io.to(roomId).emit('gameOver', { status, winner, fen: game.chess.fen() });
          // Consider cleaning up game: delete games[roomId]; game.playerSockets.forEach(sid => delete playerRooms[sid]);
        }
      } else {
        socket.emit('invalidMove', { message: 'Illegal move.' });
      }
    } catch (error) {
      // chess.js throws an error for a malformed move object.
      socket.emit('invalidMove', { message: `Invalid move format: ${error.message}` });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const roomId = playerRooms[socket.id];
    if (roomId && games[roomId]) {
      const game = games[roomId];
      console.log(`Player ${socket.id} from room ${roomId} disconnected.`);
      
      // Remove player from game
      game.playerSockets = game.playerSockets.filter(sid => sid !== socket.id);
      delete game.players[socket.id];

      // Notify remaining player(s)
      io.to(roomId).emit('opponentDisconnected', { playerId: socket.id });

      if (game.playerSockets.length < 2 && game.playerSockets.length > 0) {
         // If game was ongoing and now only one player is left, they could be declared winner.
         // For now, just log and clean up if it becomes empty.
         console.log(`Room ${roomId} now has ${game.playerSockets.length} player(s).`);
      }
      
      if (game.playerSockets.length === 0) {
        console.log(`Room ${roomId} is empty. Deleting game.`);
        delete games[roomId];
      }
    }
    delete playerRooms[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});

