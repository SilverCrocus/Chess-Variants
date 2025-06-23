import './App.css'; // Keep global styles if any, or Tailwind will handle most
import { Routes, Route, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import GameBoard from './components/GameBoard';
import HomePage from './pages/HomePage';
import Header from './components/Header';
import PageTransition from './components/PageTransition';

function App() {
  const location = useLocation();
  const [connectionStatus, setConnectionStatus] = useState(false);
  const [gameState, setGameState] = useState({
    playerColor: null,
    roomId: null,
    gamePhase: 'preGame'
  });

  // Listen for game state updates from localStorage or context
  useEffect(() => {
    const checkGameState = () => {
      const roomId = localStorage.getItem('roomId');
      const playerId = localStorage.getItem('playerId');
      
      setGameState(prev => ({
        ...prev,
        roomId: roomId || null
      }));
    };

    // Check on mount and when location changes
    checkGameState();
    
    // Listen for storage changes (cross-tab sync)
    window.addEventListener('storage', checkGameState);
    
    return () => {
      window.removeEventListener('storage', checkGameState);
    };
  }, [location]);

  const updateGameState = (newState) => {
    setGameState(prev => ({ ...prev, ...newState }));
  };

  const updateConnectionStatus = (isConnected) => {
    setConnectionStatus(isConnected);
  };

  return (
    <div className="App">
      <Header 
        isConnected={connectionStatus}
        playerColor={gameState.playerColor}
        roomId={gameState.roomId}
        gamePhase={gameState.gamePhase}
      />
      <main className="app-main">
        <Routes>
          <Route 
            path="/" 
            element={
              <PageTransition>
                <HomePage />
              </PageTransition>
            } 
          />
          <Route 
            path="/secret-queens" 
            element={
              <PageTransition>
                <GameBoard 
                  onGameStateChange={updateGameState}
                  onConnectionChange={updateConnectionStatus}
                />
              </PageTransition>
            } 
          />
          <Route 
            path="/room/:roomId" 
            element={
              <PageTransition>
                <GameBoard 
                  onGameStateChange={updateGameState}
                  onConnectionChange={updateConnectionStatus}
                />
              </PageTransition>
            } 
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
