import React from 'react';
import { Link } from 'react-router-dom';
import GameSelectionCard from '../components/GameSelectionCard';
import './HomePage.css';

const HomePage = () => {
  return (
    <div className="home-page">
      <h1>Chess Variants</h1>
      <div className="game-selection-container">
        <Link to="/secret-queens">
          <GameSelectionCard title="Secret Queens" />
        </Link>
        <GameSelectionCard title="Coming Soon" disabled />
        <GameSelectionCard title="Coming Soon" disabled />
        <GameSelectionCard title="Coming Soon" disabled />
      </div>
    </div>
  );
};

export default HomePage;
