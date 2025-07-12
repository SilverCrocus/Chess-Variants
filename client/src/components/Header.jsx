import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Header.css';

const Header = ({ isConnected, playerColor, roomId, gamePhase }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';
  const isInGame = location.pathname.includes('/room/') || location.pathname === '/secret-queens';

  const handleLogoClick = () => {
    if (isInGame) {
      const confirmLeave = window.confirm('Are you sure you want to leave the game?');
      if (confirmLeave) {
        localStorage.removeItem('roomId');
        localStorage.removeItem('playerId');
        navigate('/');
      }
    } else {
      navigate('/');
    }
  };

  return (
    <header className="main-header">
      <div className="header-content">
        <div className="header-left">
          <button onClick={handleLogoClick} className="logo-button">
            <div className="logo-container">
              <img src="/chessicon.svg" alt="Chess Variants" className="logo-image" />
              <span className="logo-text">Chess Variants</span>
            </div>
          </button>
          {!isHomePage && (
            <div className="breadcrumb">
              <span className="breadcrumb-item">
                {isInGame ? `Room ${roomId}` : 'Game'}
              </span>
            </div>
          )}
        </div>

        <div className="header-center">
          {isInGame && gamePhase && (
            <div className="game-status-indicator">
              <div className={`status-badge ${gamePhase}`}>
                {gamePhase === 'preGame' && 'Setting Up'}
                {gamePhase === 'selection' && 'Queen Selection'}
                {gamePhase === 'playing' && 'Playing'}
                {gamePhase === 'gameOver' && 'Game Over'}
              </div>
              {playerColor && (
                <div className={`player-color ${playerColor}`}>
                  {playerColor === 'w' ? 'White' : 'Black'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="header-right">
          <div className="connection-status">
            <div className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              <div className="connection-dot"></div>
              <span className="connection-text">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 