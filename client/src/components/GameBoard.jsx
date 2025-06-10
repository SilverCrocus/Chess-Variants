import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import io from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function GameBoard() {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState('');
  const [playerColor, setPlayerColor] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Enter a room ID to join or create a game.');
  const [gamePhase, setGamePhase] = useState('preGame');
  const [myPlayerData, setMyPlayerData] = useState(null);

  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => console.log('Connected to socket server with ID:', newSocket.id));

    newSocket.on('gameJoined', (data) => {
      console.log('Game joined:', data);
      setRoom(data.roomId);
      setPlayerColor(data.color);
      setMyPlayerData({ color: data.color, secretQueenInitialSquare: null, secretQueenCurrentSquare: null, secretQueenTransformed: false });
      setFen(data.fen);
      setGame(new Chess(data.fen));
      setStatusMessage(`Joined room ${data.roomId} as ${data.color === 'w' ? 'White' : 'Black'}. Waiting for opponent...`);
    });

    newSocket.on('gameStart', (data) => {
      console.log('Game starting:', data);
      const myColor = data.players[newSocket.id]?.color;
      if (myColor) {
        setPlayerColor(myColor);
        setMyPlayerData(data.players[newSocket.id]);
      }
      setRoom(data.roomId);
      setFen(data.fen);
      setGame(new Chess(data.fen));
      setGamePhase('selection');
      const colorName = myColor === 'w' ? 'White' : 'Black';
      setStatusMessage(`Game started. You are ${colorName}. Select your Secret Queen pawn.`);
    });

    newSocket.on('secretQueenSelected', (data) => {
      console.log('Secret Queen selection confirmed by server:', data);
      setMyPlayerData(prevData => ({
        ...prevData,
        secretQueenInitialSquare: data.square,
        secretQueenCurrentSquare: data.square,
      }));
      setStatusMessage(`Your Secret Queen is at ${data.square}. Waiting for opponent...`);
    });

    newSocket.on('allSecretQueensSelected', (data) => {
      console.log('All Secret Queens selected:', data);
      setFen(data.fen);
      setGame(new Chess(data.fen));
      setGamePhase('playing');
      if (data.players && data.players[newSocket.id]) {
        setMyPlayerData(data.players[newSocket.id]);
      }
      setStatusMessage(`Both players have selected! It's ${data.turn === 'w' ? 'White' : 'Black'}'s turn.`);
    });

    newSocket.on('boardUpdate', (data) => {
      console.log('Board update received:', data);
      setFen(data.fen);
      setGame(new Chess(data.fen));
      
      setMyPlayerData(prevPlayerData => {
        if (!prevPlayerData || !data.lastMove) return prevPlayerData;
        if (data.lastMove.from === prevPlayerData.secretQueenCurrentSquare) {
          const updatedPlayerData = { ...prevPlayerData, secretQueenCurrentSquare: data.lastMove.to };
          if (data.lastMove.flags === 't' && data.lastMove.piece === 'p') {
            updatedPlayerData.secretQueenTransformed = true;
          }
          return updatedPlayerData;
        }
        return prevPlayerData;
      });

      if (data.trueGameStatus?.isCheckmate || data.trueGameStatus?.isDraw) {
        // Game over logic is handled by 'gameOver' event
      } else {
        let turnMessage = `Move made. It's ${data.turn === 'w' ? 'White' : 'Black'}'s turn.`;
        if (data.trueGameStatus?.isCheck) {
          const checkedPlayerColor = data.turn === 'w' ? 'White' : 'Black';
          turnMessage += ` (${checkedPlayerColor} is in check!)`;
        }
        setStatusMessage(turnMessage);
      }
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

    newSocket.on('opponentDisconnected', () => {
      setStatusMessage('Opponent disconnected. Game may have ended.');
    });

    return () => newSocket.disconnect();
  }, []);

  const isDraggable = ({ piece }) => {
    if (gamePhase !== 'playing' || game.turn() !== playerColor) {
      return false;
    }
    return piece.startsWith(playerColor);
  };

  function handlePawnClickForSelection(square) {
    if (gamePhase !== 'selection' || !socket) return;
    const piece = game.get(square);
    if (piece?.type === 'p' && piece.color === playerColor) {
      const startingRank = playerColor === 'w' ? '2' : '7';
      if (square[1] === startingRank) {
        socket.emit('selectSecretQueen', { roomId: room, square });
        setStatusMessage(`Selected pawn at ${square}. Waiting for confirmation...`);
      } else {
        setStatusMessage('Secret Queen must be a pawn on its starting rank.');
      }
    }
  }

  function onPieceDrop(sourceSquare, targetSquare, piece) {
    if (gamePhase !== 'playing' || !socket || game.turn() !== playerColor) {
      return false;
    }
    const moveAttempt = {
      from: sourceSquare,
      to: targetSquare,
      promotion: piece[1] === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : undefined,
    };
    socket.emit('move', { roomId: room, move: moveAttempt });
    return true;
  }
  
  const handleJoinRoom = (event) => {
    event.preventDefault();
    if (room.trim() && socket) {
      socket.emit('joinGame', room.trim());
    }
  };

  const squareStyles = {};
  if (myPlayerData?.secretQueenCurrentSquare && !myPlayerData.secretQueenTransformed) {
    squareStyles[myPlayerData.secretQueenCurrentSquare] = {
      background: 'rgba(20, 80, 20, 0.4)',
    };
  }

  return (
    <div className="flex flex-col items-center p-4 bg-gray-800 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-4">Secret Queen Chess</h1>
      <div className="mb-4 text-lg">{statusMessage}</div>
      
      {gamePhase === 'preGame' && (
        <form onSubmit={handleJoinRoom} className="flex items-center">
          <input
            type="text"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Enter Room ID"
            className="p-2 rounded bg-gray-700 border border-gray-600"
          />
          <button type="submit" className="ml-2 p-2 bg-blue-600 hover:bg-blue-700 rounded">
            Join/Create Room
          </button>
        </form>
      )}

      <div className="shadow-2xl">
        <Chessboard
          position={fen}
          onPieceDrop={onPieceDrop}
          onSquareClick={handlePawnClickForSelection}
          arePiecesDraggable={isDraggable}
          boardOrientation={playerColor === 'b' ? 'black' : 'white'}
          boardWidth={500}
          customSquareStyles={squareStyles}
        />
      </div>
      <div className="mt-4 text-sm text-gray-400">
        You are playing as: {playerColor === 'w' ? 'White' : playerColor === 'b' ? 'Black' : 'Spectator'}
      </div>
    </div>
  );
}

export default GameBoard;
