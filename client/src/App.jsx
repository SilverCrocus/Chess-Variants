import './App.css'; // Keep global styles if any, or Tailwind will handle most
import { Routes, Route } from 'react-router-dom';
import GameBoard from './components/GameBoard';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<GameBoard />} />
        <Route path="/room/:roomId" element={<GameBoard />} />
      </Routes>
    </div>
  );
}

export default App;
