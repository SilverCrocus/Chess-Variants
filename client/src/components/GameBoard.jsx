import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import io from 'socket.io-client';
import './GameBoard.css';
import GameStatusDashboard from './GameStatusDashboard';
import LoadingSpinner from './LoadingSpinner';

const SOCKET_SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function GameBoard({ onGameStateChange, onConnectionChange }) {
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
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState(0);
  const [countdownInterval, setCountdownInterval] = useState(null);
  const [drawOfferSent, setDrawOfferSent] = useState(false);
  const [opponentOfferedDraw, setOpponentOfferedDraw] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Notify parent components of state changes
  useEffect(() => {
    if (onGameStateChange) {
      onGameStateChange({
        playerColor,
        roomId: room,
        gamePhase
      });
    }
  }, [playerColor, room, gamePhase, onGameStateChange]);

  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(socket?.connected || false);
    }
  }, [socket?.connected, onConnectionChange]);

  useEffect(() => {
    setIsConnecting(true);
    setConnectionError(null);
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    if (urlRoomId) {
      setRoom(urlRoomId);
      // Attempt to join game if socket is already connected, or rely on 'connect' event
      if (newSocket.connected) {
        const playerId = localStorage.getItem('playerId');
        console.log('Attempting to join game immediately. PlayerId from localStorage:', playerId, 'Room:', urlRoomId);
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
      setIsConnecting(false);
      setConnectionError(null);
      if (onConnectionChange) {
        onConnectionChange(true);
      }
      if (urlRoomId) {
        const playerId = localStorage.getItem('playerId');
        console.log('Attempting to join game on connect event. PlayerId from localStorage:', playerId, 'Room:', urlRoomId);
        newSocket.emit('joinGame', { roomId: urlRoomId, playerId });
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from socket server');
      setIsConnecting(false);
      if (onConnectionChange) {
        onConnectionChange(false);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnecting(false);
      setConnectionError('Failed to connect to server. Please try again.');
      if (onConnectionChange) {
        onConnectionChange(false);
      }
    });

    newSocket.on('gameJoined', (data) => {
      console.log('Game joined:', data);
      setIsConnecting(false);
      setConnectionError(null);
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
      setIsConnecting(false);
      setConnectionError(null);
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

      const opponentId = Object.keys(data.players).find(id => id !== data.playerId);
      if (opponentId && data.players[opponentId]?.disconnected) {
        setOpponentDisconnected(true);
      } else {
        setOpponentDisconnected(false);
      }
    });

    newSocket.on('gameStart', (data) => {
      console.log('Game starting:', data);
      setIsConnecting(false);
      setConnectionError(null);
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
      setOpponentDisconnected(false);
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
      setOpponentDisconnected(true);
      setDisconnectCountdown(30); // 30 seconds countdown
      const intervalId = setInterval(() => {
        setDisconnectCountdown(prevCountdown => prevCountdown - 1);
      }, 1000);
      setCountdownInterval(intervalId);
    });

    newSocket.on('playerReconnected', (data) => {
      setStatusMessage(data.message);
      setOpponentDisconnected(false);
      clearInterval(countdownInterval);
      setDisconnectCountdown(0);
    });

    newSocket.on('rematchOffered', (data) => {
      console.log('Opponent offered rematch:', data);
      setOpponentOfferedRematch(true);
      setStatusMessage('Opponent has offered a rematch! Click "Accept Rematch" to play again.');
    });

    newSocket.on('drawOffered', (data) => {
      console.log('Draw offered by opponent:', data);
      console.log('Current game phase:', gamePhase);
      console.log('Current player color:', playerColor);
      setOpponentOfferedDraw(true);
      setStatusMessage('Opponent offered a draw. Use the "Accept Draw" or "Decline Draw" buttons to respond.');
    });

    newSocket.on('drawAccepted', (data) => {
      console.log('Draw accepted:', data);
      setGamePhase('gameOver');
      setStatusMessage('Draw accepted! The game ended in a draw.');
      setDrawOfferSent(false);
      setOpponentOfferedDraw(false);
    });

    newSocket.on('drawDeclined', (data) => {
      console.log('Draw declined by opponent:', data);
      setDrawOfferSent(false);
      setStatusMessage('Opponent declined the draw offer.');
    });

    newSocket.on('playerDisconnected', (data) => {
      console.log('Player disconnected:', data);
      setStatusMessage(data.message);
      setOpponentDisconnected(true);
      setDisconnectCountdown(300); // 5 minutes = 300 seconds
      
      // Clear any existing countdown interval
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      const intervalId = setInterval(() => {
        setDisconnectCountdown(prevCountdown => {
          if (prevCountdown <= 1) {
            clearInterval(intervalId);
            setCountdownInterval(null);
            return 0;
          }
          return prevCountdown - 1;
        });
      }, 1000);
      setCountdownInterval(intervalId);
    });

    newSocket.on('playerReconnected', (data) => {
      console.log('Player reconnected:', data);
      setStatusMessage(data.message || 'Your opponent has reconnected.');
      setOpponentDisconnected(false);
      setDisconnectCountdown(0);
      
      // Clear countdown interval
      if (countdownInterval) {
        clearInterval(countdownInterval);
        setCountdownInterval(null);
      }
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
      setOpponentDisconnected(false);
    });

    newSocket.on('rematchCancelled', ({ message }) => {
      console.log('Rematch cancelled by server:', message);
      setStatusMessage(message);
      setOpponentOfferedRematch(false); // Ensure opponent's offer is cleared from UI
      setRematchOfferSent(false); // Reset button state
      setGamePhase('gameOver'); // Keep it in the gameOver phase, but with buttons reset
      setOpponentDisconnected(true);
    });

    return () => {
      newSocket.off('joinGame');
      newSocket.off('gameError');
      newSocket.off('boardUpdate');
      newSocket.off('gameStart');
      newSocket.off('invalidMove');
      newSocket.off('gameOver');
      newSocket.off('rematchOffered');
      newSocket.off('startRematchGame');
      newSocket.off('opponentDisconnected');
      newSocket.off('playerReconnected');
      newSocket.off('drawOffered');
      newSocket.off('drawAccepted');
      newSocket.off('drawDeclined');
      newSocket.off('playerDisconnected');
      newSocket.off('playerReconnected');
      
      // Clean up countdown interval
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      newSocket.disconnect();
    };
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
    if (room.trim() && socket && !isConnecting) {
      setIsConnecting(true);
      setConnectionError(null);
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

  const handleOfferDraw = () => {
    if (socket && gamePhase === 'playing' && !drawOfferSent) {
      socket.emit('offerDraw', { roomId: room });
      setDrawOfferSent(true);
      setStatusMessage('Draw offer sent. Waiting for opponent response...');
    }
  };

  const handleAcceptDraw = () => {
    if (socket && opponentOfferedDraw) {
      socket.emit('acceptDraw', { roomId: room });
      setOpponentOfferedDraw(false);
    }
  };

  const handleDeclineDraw = () => {
    if (socket && opponentOfferedDraw) {
      socket.emit('declineDraw', { roomId: room });
      setOpponentOfferedDraw(false);
      setStatusMessage('You declined the draw offer. Continue playing.');
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
        
        {/* Enhanced Game Status Dashboard */}
        <GameStatusDashboard
          statusMessage={statusMessage}
          gamePhase={gamePhase}
          playerColor={playerColor}
          myPlayerData={myPlayerData}
          game={game}
          opponentDisconnected={opponentDisconnected}
          disconnectCountdown={disconnectCountdown}
        />
        
        {gamePhase === 'preGame' ? (
          <form onSubmit={handleJoinRoom} className="room-form">
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Enter Room ID"
              className="room-input"
              disabled={isConnecting}
            />
            <button type="submit" className="btn" disabled={isConnecting || !room.trim()}>
              {isConnecting ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LoadingSpinner size="small" variant="secondary" showMessage={false} />
                  Connecting...
                </div>
              ) : (
                'Join/Create Room'
              )}
            </button>
            {connectionError && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span>{connectionError}</span>
              </div>
            )}
          </form>
        ) : (
          <div className="game-controls">
            <p>You are playing as: {playerColor ? (playerColor === 'w' ? 'White' : 'Black') : 'Spectator'}</p>
            
            {gamePhase === 'playing' && (
              <button onClick={handleResign} disabled={isResigning || hasResigned} className="btn">
                {hasResigned ? 'Resigned' : 'Resign'}
              </button>
            )}

            {gamePhase === 'playing' && !opponentOfferedDraw && (
              <button 
                onClick={handleOfferDraw} 
                disabled={drawOfferSent} 
                className="btn"
              >
                {drawOfferSent ? 'Draw Offered' : 'Offer Draw'}
              </button>
            )}

            {gamePhase === 'playing' && opponentOfferedDraw && (
              <div className="draw-response-buttons">
                <button onClick={handleAcceptDraw} className="btn btn-success">
                  Accept Draw
                </button>
                <button onClick={handleDeclineDraw} className="btn btn-danger">
                  Decline Draw
                </button>
              </div>
            )}

            {gamePhase === 'gameOver' && (
              <button 
                onClick={handleRematchOfferClick} 
                className="btn" 
                disabled={opponentDisconnected || (rematchOfferSent && !opponentOfferedRematch)}
              >
                {opponentDisconnected ? 'Opponent Left' : 
                 rematchOfferSent && opponentOfferedRematch ? 'Starting Rematch...' : 
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
