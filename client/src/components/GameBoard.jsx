import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import io from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function GameBoard() {
  const [isResigning, setIsResigning] = useState(false); // To disable button after click
  const [hasResigned, setHasResigned] = useState(false);
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState('');
  const [playerColor, setPlayerColor] = useState(null);
  const [statusMessage, setStatusMessage] = useState(
    urlRoomId ? `Joining room ${urlRoomId}...` : 'Enter a room ID to join or create a game.'
  );
  const [gamePhase, setGamePhase] = useState('preGame');
  const [myPlayerData, setMyPlayerData] = useState(null);
  const [boardWidth, setBoardWidth] = useState(500);

  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    if (urlRoomId) {
      setRoom(urlRoomId);
      // Attempt to join game if socket is already connected, or rely on 'connect' event
      if (newSocket.connected) {
        const playerId = localStorage.getItem('playerId');
        newSocket.emit('joinGame', { roomId: urlRoomId, playerId });
      }
    }

    newSocket.on('connect', () => {
      console.log('Connected to socket server with ID:', newSocket.id);
      if (urlRoomId) {
        const playerId = localStorage.getItem('playerId');
        newSocket.emit('joinGame', { roomId: urlRoomId, playerId });
      }
    });

    newSocket.on('gameJoined', (data) => {
      console.log('Game joined:', data);
      localStorage.setItem('roomId', data.roomId);
      localStorage.setItem('playerId', data.playerId);
      setRoom(data.roomId);
      navigate(`/room/${data.roomId}`, { replace: true });
      setPlayerColor(data.color);
      setMyPlayerData({ playerId: data.playerId, color: data.color, secretQueenInitialSquare: null, secretQueenCurrentSquare: null, secretQueenTransformed: false });
      setFen(data.fen);
      setGame(new Chess(data.fen));
      setStatusMessage(`Joined room ${data.roomId} as ${data.color === 'w' ? 'White' : 'Black'}. Waiting for opponent...`);
    });
    


    newSocket.on('gameRejoined', (data) => {
      console.log('Successfully rejoined game:', data);
      setRoom(data.roomId);
      setPlayerColor(data.color);
      setFen(data.fen);
      setGame(new Chess(data.fen));
      const myData = data.players[data.playerId];
      setMyPlayerData(myData);
      
      if (myData.secretQueenInitialSquare) {
        setGamePhase('playing');
        setStatusMessage(`Rejoined game. It's ${data.turn === 'w' ? 'White' : 'Black'}'s turn.`);
      } else {
        setGamePhase('selection');
        setStatusMessage(`Rejoined game. You are ${data.color === 'w' ? 'White' : 'Black'}. Select your Secret Queen pawn.`);
      }
    });

    newSocket.on('gameStart', (data) => {
      console.log('Game starting:', data);
      let myPlayerId = localStorage.getItem('playerId');
      let myData = myPlayerId ? data.players[myPlayerId] : null;

      if (!myData) {
        const playerEntry = Object.entries(data.players).find(
          ([id, player]) => player.socketId === newSocket.id
        );

        if (playerEntry) {
          myPlayerId = playerEntry[0];
          myData = playerEntry[1];
          localStorage.setItem('playerId', myPlayerId);
        }
      }

      if (myData) {
        setPlayerColor(myData.color);
        setMyPlayerData(myData);
      }
      
      setRoom(data.roomId);
      // Ensure URL reflects the room if joining through form after initial load on '/' 
      if (!urlRoomId || urlRoomId !== data.roomId) {
        navigate(`/room/${data.roomId}`, { replace: true });
      }
      setFen(data.fen);
      setGame(new Chess(data.fen));
      setGamePhase('selection');
      const colorName = myData?.color === 'w' ? 'White' : 'Black';
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
      setGamePhase('playing');
      setStatusMessage("All Secret Queens selected. It's White's turn.");
      if (myPlayerData && data.players && data.players[myPlayerData.playerId]) {
        setMyPlayerData(prevData => ({
          ...prevData,
          ...data.players[myPlayerData.playerId]
        }));
      }
    });

    newSocket.on('boardUpdate', (data) => {
      console.log('Board update received:', data);
      setFen(data.fen);
      setGame(new Chess(data.fen));
      
      const myPlayerId = localStorage.getItem('playerId');
      if (myPlayerId && data.players[myPlayerId]) {
          setMyPlayerData(data.players[myPlayerId]);
      }

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
      let message = 'Game Over.';
      if (data.status) {
        if (data.status.isCheckmate) {
            const winner = data.turn === 'w' ? 'Black' : 'White';
            message = `Game Over: Checkmate! ${winner} wins.`;
        } else if (data.status.isDraw) {
            message = 'Game Over: Draw.';
        }
      } else if (data.winner) {
          message = `Game Over: ${data.reason}`;
      }
      setStatusMessage(message);

      // Check if the current player resigned or if the game ended due to any resignation
      if (data.reason.toLowerCase().includes('resigned')) {
        // If the reason includes "resigned", we can assume the game ended due to resignation.
        // We don't necessarily need to check if *this* specific player resigned,
        // as the button should reflect the game's final state for both players.
        setHasResigned(true);
      }

      localStorage.removeItem('roomId');
      localStorage.removeItem('playerId');
      // No automatic navigation on game over, user can see the final board.
      // navigate('/', { replace: true }); 
    });

    newSocket.on('gameError', (data) => {
      console.error('Game Error:', data.message);
      setStatusMessage(`Error: ${data.message}`);
      if (data.type === 'resign_failed') {
        setIsResigning(false); // Re-enable the button on failure
      }
    });

    newSocket.on('opponentDisconnected', (data) => {
      setStatusMessage(data.message);
    });

    newSocket.on('playerReconnected', (data) => {
      setStatusMessage(data.message);
    });

    return () => newSocket.disconnect();
  }, [urlRoomId]);

  useEffect(() => {
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      const newBoardWidth = Math.min(screenWidth * 0.9, 500);
      setBoardWidth(newBoardWidth);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
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
      socket.emit('joinGame', { roomId: room.trim() });
    }
  };

  const handleResign = () => {
    if (socket && gamePhase === 'playing' && !isResigning) {
      setIsResigning(true); // Prevent multiple clicks
      socket.emit('resign');
      // Optional: Update status message immediately for the resigning player
      // setStatusMessage("You have resigned. Waiting for server confirmation...");
    }
  };

  const squareStyles = {};
  if (myPlayerData?.secretQueenCurrentSquare && !myPlayerData.secretQueenTransformed) {
    squareStyles[myPlayerData.secretQueenCurrentSquare] = {
      background: 'rgba(20, 80, 20, 0.4)',
    };
  }

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 bg-gray-800 text-white min-h-screen w-full">
      <h1 className="text-3xl font-bold mb-4">Secret Queen Chess</h1>
      <div className="mb-4 text-lg">{statusMessage}</div>
      
      {gamePhase === 'preGame' && !urlRoomId && (
        <form onSubmit={handleJoinRoom} className="flex flex-col sm:flex-row items-center w-full max-w-sm">
          <input
            type="text"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Enter Room ID"
            className="p-2 rounded bg-gray-700 border border-gray-600 w-full mb-2 sm:mb-0 sm:mr-2"
          />
          <button type="submit" className="p-2 bg-blue-600 hover:bg-blue-700 rounded w-full sm:w-auto">
            Join/Create Room
          </button>
        </form>
      )}

      <div className="shadow-2xl w-full flex justify-center">
        <Chessboard
          position={fen}
          onPieceDrop={onPieceDrop}
          onSquareClick={handlePawnClickForSelection}
          arePiecesDraggable={isDraggable}
          boardOrientation={playerColor === 'b' ? 'black' : 'white'}
          boardWidth={boardWidth}
          customSquareStyles={squareStyles}
        />
      </div>
      <div className="mt-4 flex flex-col items-center w-full max-w-md">
        <div className="text-sm text-gray-400 mb-2">
          You are playing as: {playerColor === 'w' ? 'White' : playerColor === 'b' ? 'Black' : 'Spectator'}
        </div>
        {gamePhase === 'playing' && playerColor && (
          <button
            onClick={handleResign}
            disabled={isResigning || hasResigned} // Disable if resigning or already resigned
            className="p-2 bg-red-600 hover:bg-red-700 rounded w-full sm:w-auto disabled:opacity-50"
          >
            {hasResigned ? 'Resigned' : isResigning ? 'Resigning...' : 'Resign'}
          </button>
        )}
      </div>
    </div>
  );
}

export default GameBoard;
