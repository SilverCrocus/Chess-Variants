import React from 'react';
import { Link } from 'react-router-dom';
import GameSelectionCard from '../components/GameSelectionCard';
import './HomePage.css';

const HomePage = () => {
  return (
    <div className="home-page">
      <div className="home-content">
        <div className="hero-section">
          <h1>Chess Variants</h1>
          <p className="hero-subtitle">
            Experience chess like never before with unique variants and secret mechanics
          </p>
        </div>
        
        <div className="game-selection-container">
          <Link to="/secret-queens" className="game-link">
            <GameSelectionCard 
              title="Secret Queens" 
              description="Hide your queen's identity until the perfect moment to reveal it"
              players="2 Players"
              difficulty="Intermediate"
            />
          </Link>
          
          <GameSelectionCard 
            title="King of the Hill" 
            description="Race to control the center of the board"
            players="2 Players"
            difficulty="Advanced"
            disabled 
          />
          
          <GameSelectionCard 
            title="Atomic Chess" 
            description="Pieces explode when captured, adding chaos to strategy"
            players="2 Players"
            difficulty="Expert"
            disabled 
          />
          
          <GameSelectionCard 
            title="Three Check" 
            description="Give three checks to win the game"
            players="2 Players"
            difficulty="Beginner"
            disabled 
          />
        </div>
        
        <div className="features-section">
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">🚀</div>
              <h3>Real-time Multiplayer</h3>
              <p>Play with friends online with instant synchronization</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>Strategic Depth</h3>
              <p>Each variant adds new layers of strategy and excitement</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🏆</div>
              <h3>Competitive Play</h3>
              <p>Challenge players and climb the leaderboards</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
