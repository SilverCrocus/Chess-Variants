import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import io from 'socket.io-client';
import './GameBoard.css';

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
  const [rematchOfferSent, setRematchOfferSent] = useState(false);
  const [opponentOfferedRematch, setOpponentOfferedRematch] = useState(false);

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
    } else {
      // We are on the homepage (path "/") or urlRoomId is undefined
      // Reset all game-specific states for a clean slate
      setGame(new Chess());
      setFen('start'); // Reset to initial board position
      setPlayerColor(null);
      setMyPlayerData(null);
      setGamePhase('preGame'); // Critical for showing the join/create form
      setStatusMessage('Enter a room ID to join or create a game.'); // Default homepage message
      setIsResigning(false);
      setHasResigned(false);
      setRoom(''); // Clear the room input field state
      // Reset any other game-specific UI states if necessary, e.g., for Secret Queen selection
      // setSelectedPawn(null); // Example if such state exists
      // setSecretQueenPawns({}); // Example if such state exists
      // setSecretQueenSelectionComplete(false); // Example if such state exists
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

      if (myData && myData.secretQueenInitialSquare) {
        // Player is rejoining a game where they already selected their queen
        setGamePhase(data.gamePhase || 'playing'); 
        setStatusMessage(`Rejoined game in room ${data.roomId}. You are ${data.color === 'w' ? 'White' : 'Black'}. ${data.turn === myData.color ? 'It\'s your turn.' : 'Waiting for opponent.'}`);
      } else if (myData) {
        // Player is joining and needs to select their queen, or game is moving to selection for them
        setGamePhase('selection');
        setStatusMessage(`Joined room ${data.roomId}. You are ${data.color === 'w' ? 'White' : 'Black'}. Game is starting! Select your Secret Queen pawn.`);
      } else {
        // Fallback or error case - should ideally not happen if data is consistent
        setStatusMessage('Trying to connect to game...'); 
        console.error('Player data not found in gameRejoined event for player:', data.playerId, data.players);
      }

      // This additional check for allQueensSelected might be redundant if the above logic is sound
      // or could be used to refine the message further if needed, e.g., if rejoining and all queens are selected but it's not your turn.
      // For now, the above handles the primary distinction.
      // if (data.allQueensSelected && gamePhase !== 'selection') { ... }
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
      setGamePhase('gameOver'); // Set game phase to gameOver

      // Check if the current player resigned or if the game ended due to any resignation
      if (data.reason.toLowerCase().includes('resigned')) {
        setHasResigned(true);
      }

      // localStorage items are now cleared in handleGoHome, which is used by Play Again / Go to Homepage
      // localStorage.removeItem('roomId'); 
      // localStorage.removeItem('playerId');
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

    newSocket.on('rematchOffered', (data) => {
      console.log('Opponent offered rematch:', data);
      setOpponentOfferedRematch(true);
      setStatusMessage('Opponent has offered a rematch! Click "Accept Rematch" to play again.');
    });

    newSocket.on('startRematchGame', (newGameData) => {
      console.log('Rematch starting with new data:', newGameData);
      setGame(new Chess(newGameData.fen));
      setFen(newGameData.fen);
      setPlayerColor(newGameData.playerColor); // Server sends the NEW color for this client
      setMyPlayerData(newGameData.myPlayerData); // Server sends updated player data
      setGamePhase('selection'); // Or as per newGameData.gamePhase if provided
      setStatusMessage(`Rematch started! You are now ${newGameData.playerColor === 'w' ? 'White' : 'Black'}. Select your Secret Queen.`);
      setRematchOfferSent(false);
      setOpponentOfferedRematch(false);
      setHasResigned(false); // Reset resignation status for the new game
      setIsResigning(false);
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

  const handleGoHome = () => {
    localStorage.removeItem('roomId');
    localStorage.removeItem('playerId');
    setRematchOfferSent(false); // Reset rematch states when going home
    setOpponentOfferedRematch(false);
    navigate('/');
  };

  const handleRematchOfferClick = () => {
    if (socket && gamePhase === 'gameOver') {
      socket.emit('offerRematch', { roomId: room });
      setRematchOfferSent(true);
      // Status message will be updated based on opponent's response or if they also offered
      if (opponentOfferedRematch) {
        // This means current player is accepting an existing offer
        setStatusMessage('Rematch accepted! Waiting for new game to start...');
      } else {
        setStatusMessage('Rematch offer sent. Waiting for opponent...');
      }
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
    <div className="game-container">
      <div className="chessboard-container">
        <Chessboard
          position={fen}
          onPieceDrop={onPieceDrop}
          onSquareClick={handlePawnClickForSelection}
          arePiecesDraggable={isDraggable}
          boardWidth={boardWidth}
          customSquareStyles={squareStyles}
          boardOrientation={playerColor === 'b' ? 'black' : 'white'}
        />
      </div>
      <div className="game-info">
        <h2>Secret Queen Chess</h2>
        <p className="status-message">{statusMessage}</p>

        {gamePhase === 'preGame' ? (
          <form onSubmit={handleJoinRoom} className="room-form">
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Enter Room ID"
              className="room-input"
            />
            <button type="submit" className="btn">Join/Create Room</button>
          </form>
        ) : (
          <div className="game-controls">
            <p>You are playing as: {playerColor ? (playerColor === 'w' ? 'White' : 'Black') : 'Spectator'}</p>
            
            {gamePhase === 'playing' && (
              <button onClick={handleResign} disabled={isResigning || hasResigned} className="btn">
                {hasResigned ? 'Resigned' : 'Resign'}
              </button>
            )}

            {gamePhase === 'gameOver' && (
              <button 
                onClick={handleRematchOfferClick} 
                className="btn" 
                disabled={rematchOfferSent && !opponentOfferedRematch} // Disabled if I offered and opponent hasn't responded/offered yet
              >
                {rematchOfferSent && opponentOfferedRematch ? 'Starting Rematch...' : 
                 rematchOfferSent ? 'Rematch Offered' : 
                 opponentOfferedRematch ? 'Accept Rematch' : 
                 'Offer Rematch'}
              </button>
            )}

            {/* "Go to Homepage" button shown during selection, playing, or game over */}
            {(gamePhase === 'selection' || gamePhase === 'playing' || gamePhase === 'gameOver') && (
              <button onClick={handleGoHome} className="btn btn-secondary">
                Go to Homepage
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GameBoard;
