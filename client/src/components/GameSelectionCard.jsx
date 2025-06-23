import React from 'react';
import './GameSelectionCard.css';

const GameSelectionCard = ({ 
  title, 
  description, 
  players, 
  difficulty, 
  disabled = false 
}) => {
  const getDifficultyColor = (diff) => {
    switch (diff?.toLowerCase()) {
      case 'beginner': return 'green';
      case 'intermediate': return 'yellow';
      case 'advanced': return 'orange';
      case 'expert': return 'red';
      default: return 'gray';
    }
  };

  return (
    <div className={`game-selection-card ${disabled ? 'disabled' : ''}`}>
      <div className="card-content">
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
          {difficulty && (
            <div className={`difficulty-badge ${getDifficultyColor(difficulty)}`}>
              {difficulty}
            </div>
          )}
        </div>
        
        {description && (
          <p className="card-description">{description}</p>
        )}
        
        <div className="card-footer">
          {players && (
            <div className="card-meta">
              <span className="meta-icon">👥</span>
              <span className="meta-text">{players}</span>
            </div>
          )}
          
          <div className="card-action">
            {disabled ? (
              <span className="coming-soon">Coming Soon</span>
            ) : (
              <span className="play-text">Play Now →</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameSelectionCard;
