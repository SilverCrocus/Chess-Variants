import './App.css'; // Keep global styles if any, or Tailwind will handle most
import GameBoard from './components/GameBoard';

function App() {
  return (
    <div className="App">
      <GameBoard />
    </div>
  );
}

export default App;
