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
        players: { [socket.id]: { color: 'w', secretQueenInitialSquare: null, secretQueenCurrentSquare: null, secretQueenTransformed: false } }, // Assign first player to white
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
      games[roomId].players[socket.id] = { color: 'b', secretQueenInitialSquare: null, secretQueenCurrentSquare: null, secretQueenTransformed: false }; // Assign second player to black
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
    const { roomId, move } = data; // move: { from, to, promotion?, isSecretQueenMove? }
    const game = games[roomId];

    if (!game) {
      socket.emit('gameError', { message: 'Game not found.' });
      return;
    }

    const playerData = game.players[socket.id];
    if (!playerData || !playerData.color) {
      socket.emit('gameError', { message: 'You are not a player in this game.' });
      return;
    }

    if (game.chess.turn() !== playerData.color) {
      socket.emit('invalidMove', { message: 'Not your turn.' });
      return;
    }

    let moveResult = null;
    const pieceMoving = game.chess.get(move.from);

    // Check if the piece being moved is the player's untransformed Secret Queen pawn
    if (
      playerData.secretQueenCurrentSquare === move.from &&
      pieceMoving && pieceMoving.type === 'p' &&
      !playerData.secretQueenTransformed
    ) {
      // It's the Secret Queen pawn. First, try to move it as a regular pawn.
      try {
        moveResult = game.chess.move(move);
        // If we are here, the pawn move was valid. Update the square.
        playerData.secretQueenCurrentSquare = move.to;
        // A standard pawn move can also be a transformation (promotion).
        if (moveResult.flags.includes('p')) {
          playerData.secretQueenTransformed = true;
        }
      } catch (e) {
        // The regular pawn move was illegal. Now, check if it's a valid special queen move.
        const tempChess = new Chess(game.chess.fen());
        tempChess.remove(move.from);
        tempChess.put({ type: 'q', color: playerData.color }, move.from);

        let queenMoveAttempt = null;
        try {
          queenMoveAttempt = tempChess.move({ from: move.from, to: move.to });
        } catch (err) {
          queenMoveAttempt = null; // Move is not valid as a queen either.
        }

        if (queenMoveAttempt) {
          // It's a valid queen move! Apply transformation to the main board.
          game.chess.remove(move.from);
          game.chess.put({ type: 'q', color: playerData.color }, move.to);

          // **FIX**: Manually flip the turn since we didn't use game.chess.move()
          const fenParts = game.chess.fen().split(' ');
          fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w'; // Flip active color
          if (fenParts[3] !== '-') { // If an en-passant square was possible...
            fenParts[3] = '-';      // ...clear it, as this non-pawn move removes that possibility.
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
          // It's not a valid pawn move AND not a valid queen move. It's truly illegal.
          if (game.chess.isCheck()) {
            socket.emit('invalidMove', { message: "You're in check. You must make a move to get out of check." });
          } else {
            socket.emit('invalidMove', { message: 'Illegal move for Secret Queen pawn (tried as pawn and queen).' });
          }
          return;
        }
      }
    } else {
      // This is a regular move for any other piece.
      try {
        moveResult = game.chess.move(move);
        // If the piece that moved was the (already transformed) Secret Queen, update its square.
        if (playerData.secretQueenCurrentSquare === move.from) {
          playerData.secretQueenCurrentSquare = move.to;
        }
      } catch (e) {
        if (game.chess.isCheck()) {
          socket.emit('invalidMove', { message: "You're in check. You must make a move to get out of check." });
        } else {
          // The move is illegal for a reason other than being in check.
          // chess.js's e.message can be generic, so let's provide a simple, clear message.
          socket.emit('invalidMove', { message: 'Illegal move.' });
        }
        return;
      }
    }

    if (moveResult) {
      // --- Start of Post-Move Analysis ---
      const analysisChess = new Chess(game.chess.fen());
      // Iterate over all players in the game to find their secret queens
      for (const socketIdInGame in game.players) {
        if (Object.hasOwnProperty.call(game.players, socketIdInGame)) {
          const playerAnalyzed = game.players[socketIdInGame];
          if (playerAnalyzed.secretQueenCurrentSquare && !playerAnalyzed.secretQueenTransformed) {
            const pieceOnMainBoard = game.chess.get(playerAnalyzed.secretQueenCurrentSquare);
            // Ensure the piece is still there and is a pawn of the correct color
            if (pieceOnMainBoard && pieceOnMainBoard.type === 'p' && pieceOnMainBoard.color === playerAnalyzed.color) {
              analysisChess.remove(playerAnalyzed.secretQueenCurrentSquare);
              analysisChess.put({ type: 'q', color: playerAnalyzed.color }, playerAnalyzed.secretQueenCurrentSquare);
            }
          }
        }
      }

      const trueGameStatus = {
        isCheck: analysisChess.isCheck(),
        isCheckmate: analysisChess.isCheckmate(),
        isDraw: analysisChess.isDraw(),
        isStalemate: analysisChess.isStalemate(),
        isThreefoldRepetition: analysisChess.isThreefoldRepetition(),
        isInsufficientMaterial: analysisChess.isInsufficientMaterial(),
        turn: analysisChess.turn() // Current turn on the analysis board
      };
      // --- End of Post-Move Analysis ---

      io.to(roomId).emit('boardUpdate', {
        fen: game.chess.fen(),
        turn: game.chess.turn(), // Turn on the actual game board
        lastMove: moveResult,
        trueGameStatus // Send the status from the analysis board
      });

      // Check for game over based on either visual board or true status
      if (game.chess.isGameOver() || trueGameStatus.isCheckmate || trueGameStatus.isDraw) {
        let finalStatus = 'Game Over';
        let finalWinner = null; // null for draw

        if (trueGameStatus.isCheckmate) {
          finalStatus = 'Checkmate (Secret Queens Revealed)';
          finalWinner = trueGameStatus.turn === 'w' ? 'b' : 'w'; // Player whose turn it IS on analysis board is checkmated
        } else if (trueGameStatus.isDraw) {
          finalStatus = 'Draw (Secret Queens Revealed)';
          if (trueGameStatus.isStalemate) finalStatus = 'Stalemate (Secret Queens Revealed)';
          else if (trueGameStatus.isThreefoldRepetition) finalStatus = 'Threefold Repetition (Secret Queens Revealed)';
          else if (trueGameStatus.isInsufficientMaterial) finalStatus = 'Insufficient Material (Secret Queens Revealed)';
        } else if (game.chess.isCheckmate()) { // Fallback to visual board if true status isn't decisive but visual is
            finalStatus = 'Checkmate (Visual Board)';
            finalWinner = game.chess.turn() === 'w' ? 'b' : 'w';
        } else if (game.chess.isDraw()) {
            finalStatus = 'Draw (Visual Board)';
            if (game.chess.isStalemate()) finalStatus = 'Stalemate (Visual Board)';
            else if (game.chess.isThreefoldRepetition()) finalStatus = 'Threefold Repetition (Visual Board)';
            else if (game.chess.isInsufficientMaterial()) finalStatus = 'Insufficient Material (Visual Board)';
        }

        io.to(roomId).emit('gameOver', {
          status: finalStatus,
          winner: finalWinner,
          fen: game.chess.fen(), // Current visual FEN
          trueGameStatus // Always send the true game status
        });
      }
    } else {
      // This path should ideally not be reached if all error cases above emit and return.
      console.error(`Move processing resulted in no moveResult for room ${roomId}, move ${JSON.stringify(move)}`);
      socket.emit('gameError', { message: 'Server error during move processing.' });
    }
  });

  socket.on('selectSecretQueen', (data) => {
    const { roomId, square } = data;
    const game = games[roomId];

    if (!game) {
      socket.emit('gameError', { message: 'Game not found.' });
      return;
    }

    const player = game.players[socket.id];
    if (!player) {
      socket.emit('gameError', { message: 'You are not a player in this game.' });
      return;
    }

    // Validate if the square is a valid pawn for the player's color
    const validPawnSquares = player.color === 'w' 
      ? ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'] 
      : ['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7'];

    if (!validPawnSquares.includes(square)) {
      socket.emit('gameError', { message: 'Invalid square for Secret Queen selection.' });
      return;
    }

    // Check if a secret queen has already been selected
    if (player.secretQueenInitialSquare) {
        socket.emit('gameError', { message: 'Secret Queen already selected.' });
        return;
    }

    player.secretQueenInitialSquare = square;
    player.secretQueenCurrentSquare = square;
    socket.emit('secretQueenSelected', { square, fen: game.chess.fen() });
    console.log(`Player ${socket.id} in room ${roomId} selected Secret Queen at ${square}`);

    // Check if both players have selected their Secret Queens
    let selectedCount = 0;
    for (const playerIdInGame in game.players) {
      if (game.players[playerIdInGame].secretQueenInitialSquare) {
        selectedCount++;
      }
    }

    if (selectedCount === 2) {
      console.log(`Both players in room ${roomId} have selected Secret Queens. Starting game.`);
      io.to(roomId).emit('allSecretQueensSelected', {
        fen: game.chess.fen(), // Initial FEN
        turn: game.chess.turn(), // Should be 'w'
        players: game.players // Send updated player data with selections
      });
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

