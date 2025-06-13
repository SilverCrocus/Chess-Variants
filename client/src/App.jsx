import './App.css'; // Keep global styles if any, or Tailwind will handle most
import { Routes, Route } from 'react-router-dom';
import GameBoard from './components/GameBoard';
import HomePage from './pages/HomePage';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/secret-queens" element={<GameBoard />} />
        <Route path="/room/:roomId" element={<GameBoard />} />
      </Routes>
    </div>
  );
}

export default App;
