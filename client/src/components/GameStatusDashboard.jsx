import React from 'react';
import './GameStatusDashboard.css';

const GameStatusDashboard = ({ 
  statusMessage, 
  gamePhase, 
  playerColor, 
  myPlayerData, 
  game,
  opponentDisconnected,
  disconnectCountdown
}) => {
  const currentTurn = game?.turn();
  const isMyTurn = currentTurn === playerColor;
  
  const getGamePhaseInfo = () => {
    switch (gamePhase) {
      case 'preGame':
        return { text: 'Setting Up Game', color: 'blue', icon: '⚙️' };
      case 'selection':
        return { text: 'Queen Selection', color: 'yellow', icon: '👑' };
      case 'playing':
        return { text: 'Game In Progress', color: 'green', icon: '⚔️' };
      case 'gameOver':
        return { text: 'Game Complete', color: 'red', icon: '🏁' };
      default:
        return { text: 'Unknown', color: 'gray', icon: '❓' };
    }
  };

  const phaseInfo = getGamePhaseInfo();

  const getTurnIndicator = () => {
    if (gamePhase !== 'playing') return null;
    
    return {
      currentPlayer: currentTurn === 'w' ? 'White' : 'Black',
      isMyTurn,
      turnColor: currentTurn
    };
  };

  const turnInfo = getTurnIndicator();

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="game-status-dashboard">
      {/* Game Phase Indicator */}
      <div className={`phase-indicator ${phaseInfo.color}`}>
        <span className="phase-icon">{phaseInfo.icon}</span>
        <span className="phase-text">{phaseInfo.text}</span>
      </div>

      {/* Turn Indicator */}
      {turnInfo && (
        <div className={`turn-indicator ${turnInfo.isMyTurn ? 'my-turn' : 'opponent-turn'}`}>
          <div className="turn-content">
            <div className={`turn-player ${turnInfo.turnColor}`}>
              {turnInfo.currentPlayer}'s Turn
            </div>
            {turnInfo.isMyTurn && (
              <div className="turn-pulse">
                <div className="pulse-dot"></div>
                <span>Your Move</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Player Information */}
      <div className="player-info">
        <div className="player-card">
          <div className={`player-indicator ${playerColor}`}>
            <span className="player-icon">
              {playerColor === 'w' ? '♔' : '♚'}
            </span>
            <span className="player-label">
              You are {playerColor === 'w' ? 'White' : 'Black'}
            </span>
          </div>
          
          {myPlayerData?.secretQueenInitialSquare && (
            <div className="secret-queen-info">
              <span className="queen-icon">👑</span>
              <span className="queen-text">
                Secret Queen: {myPlayerData.secretQueenCurrentSquare}
                {myPlayerData.secretQueenTransformed && (
                  <span className="transformed-badge">Revealed</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Status Message */}
      <div className="status-message-container">
        <div className={`status-message ${gamePhase}`}>
          {statusMessage}
        </div>
      </div>

      {/* Disconnection Warning */}
      {opponentDisconnected && disconnectCountdown > 0 && (
        <div className="disconnect-warning">
          <div className="disconnect-header">
            <span className="warning-icon">⚠️</span>
            <span>Opponent Disconnected</span>
          </div>
          <div className="disconnect-timer">
            <span className="timer-text">Reconnection window:</span>
            <span className="timer-value">{formatTime(disconnectCountdown)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameStatusDashboard; 