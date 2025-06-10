import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js'; // For local validation/move making if needed, and FEN updates
import io from 'socket.io-client';

// Assuming your backend server is running on port 3001
const SOCKET_SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function GameBoard() {
  const [game, setGame] = useState(new Chess()); // Stores the chess.js instance
  const [fen, setFen] = useState(game.fen()); // FEN string for the board
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(''); // To be set by user input or other logic
  const [playerColor, setPlayerColor] = useState(null); // 'w' or 'b'
  const [statusMessage, setStatusMessage] = useState('Enter a room ID to join or create a game.');

  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to socket server with ID:', newSocket.id);
    });

    newSocket.on('gameJoined', (data) => {
      console.log('Game joined:', data);
      setRoom(data.roomId);
      setPlayerColor(data.color);
      setFen(data.fen);
      const newGameInstance = new Chess(data.fen);
      setGame(newGameInstance);
      setStatusMessage(`Joined room ${data.roomId} as ${data.color === 'w' ? 'White' : 'Black'}. Waiting for opponent...`);
    });

    newSocket.on('gameStart', (data) => {
      console.log('Game starting:', data);

      // Determine player color from the players object
      const myColor = data.players[newSocket.id];
      if (myColor) {
        setPlayerColor(myColor);
      }

      setRoom(data.roomId); // Ensure the room is set for the second player

      setFen(data.fen);
      const newGameInstance = new Chess(data.fen);
      setGame(newGameInstance);

      // Use the just-determined color for the status message
      const colorName = myColor === 'w' ? 'White' : 'Black';
      setStatusMessage(`Game started in room ${data.roomId}. You are ${colorName}. It's ${data.turn === 'w' ? 'White' : 'Black'}'s turn.`);
    });
    
    newSocket.on('boardUpdate', (data) => {
      console.log('Board update received:', data);
      setFen(data.fen);
      const newGameInstance = new Chess(data.fen); // Create new instance to ensure reactivity
      setGame(newGameInstance);
      setStatusMessage(`Move made. It's ${data.turn === 'w' ? 'White' : 'Black'}'s turn.`);
    });

    newSocket.on('invalidMove', (data) => {
      console.error('Invalid move:', data.message);
      setStatusMessage(`Invalid move: ${data.message}`);
    });

    newSocket.on('gameOver', (data) => {
      console.log('Game Over:', data);
      let message = `Game Over: ${data.status}.`;
      if (data.winner) {
        message += ` ${data.winner === 'w' ? 'White' : 'Black'} wins!`;
      }
      setStatusMessage(message);
    });
    
    newSocket.on('gameError', (data) => {
        console.error('Game Error:', data.message);
        setStatusMessage(`Error: ${data.message}`);
    });

    newSocket.on('opponentDisconnected', (data) => {
        console.log('Opponent disconnected:', data.playerId);
        setStatusMessage('Opponent disconnected. Game may have ended.');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []); // Run this effect once on mount to establish and clean up the socket connection

  function onPieceDrop(sourceSquare, targetSquare, piece) {
    // New logging for debugging
    console.log('--- Move Attempt ---');
    console.log('My color (state):', playerColor);
    console.log("Board's turn:", game.turn());
    console.log('Is it my turn?', game.turn() === playerColor);
    // End new logging

    if (!socket || !room || game.turn() !== playerColor) {
      setStatusMessage("Cannot make a move. Not your turn or not in a game.");
      return false; // Disallow move
    }

    const moveAttempt = {
      from: sourceSquare,
      to: targetSquare,
      promotion: piece[1].toLowerCase() === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : undefined,
    };
    
    // Basic local validation (optional, server is authoritative)
    const localGame = new Chess(fen); // Use current FEN
    const isValidLocalMove = localGame.move(moveAttempt);

    if (!isValidLocalMove) {
        setStatusMessage("Locally invalid move. Check your move.");
        return false; // prevent board update
    }
    
    // If locally valid, emit to server
    socket.emit('move', { roomId: room, move: moveAttempt });
    // The board will update based on server's 'boardUpdate' event
    return true; // Optimistically allow the move on the board, server will correct if needed
  }

  const handleJoinRoom = (event) => {
    event.preventDefault();
    const roomIdToJoin = event.target.elements.roomId.value;
    if (socket && roomIdToJoin) {
      socket.emit('joinGame', roomIdToJoin);
    }
  };

  return (
    <div className="p-4 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4">Chess Game</h1>
      <form onSubmit={handleJoinRoom} className="mb-4">
        <input 
          type="text" 
          name="roomId" 
          placeholder="Enter Room ID" 
          className="border p-2 mr-2"
          disabled={!!room} // Disable if already in a room
        />
        <button type="submit" className="bg-blue-500 text-white p-2 rounded" disabled={!!room}>
          Join/Create Room
        </button>
      </form>
      <div className="min-h-[3rem] mb-2 text-center w-full max-w-md"> {/* Container for status messages */}
        <div>Status: {statusMessage}</div>
        {playerColor && <div>You are playing as: {playerColor === 'w' ? 'White' : 'Black'}</div>}
      </div>
      <div> {/* Wrapper for Chessboard, boardWidth prop will handle size */}
        <Chessboard 
          position={fen} 
          onPieceDrop={onPieceDrop}
          boardOrientation={playerColor === 'b' ? 'black' : 'white'}
          boardWidth={500} // Increased board size
        />
      </div>
    </div>
  );
}

export default GameBoard;
