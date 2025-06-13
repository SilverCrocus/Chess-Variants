import React from 'react';
import './GameSelectionCard.css';

const GameSelectionCard = ({ title, disabled }) => {
  return (
    <div className={`game-selection-card ${disabled ? 'disabled' : ''}`}>
      <h3>{title}</h3>
    </div>
  );
};

export default GameSelectionCard;
