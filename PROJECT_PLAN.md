# Project Plan: Chess Variants Web App

This document outlines the step-by-step plan for building a web application to play chess variants, starting with "Secret Queen".

## Technology Stack

* **Frontend:** React (with Vite), `react-chessboard`, `socket.io-client`, Tailwind CSS
* **Backend:** Node.js, Express.js, `socket.io`, `chess.js`
* **Development:** VS Code, Git & GitHub, Node.js (LTS)

---

## Phase 0: Project Foundation & Setup

The goal of this phase is to create a clean, organized project structure and initialize all the necessary tools.

### Checkist
- [ ] Install Node.js and npm/yarn on your computer.
- [ ] Install Git.
- [ ] Create a main project folder (e.g., `chess-variants-app`).
- [ ] Inside the main folder, create two sub-folders: `client` and `server`.
- [ ] Open the main folder in VS Code.
- [ ] Initialize a Git repository in the main folder (`git init`).
- [ ] Create a GitHub repository and push the initial structure.
- [ ] Create a `.gitignore` file in the root to ignore `node_modules` in both client and server.

---

## Phase 1: Building the Core Classic Chess Game (MVP)

Focus on making a standard, two-player chess game work perfectly. This ensures your foundation is solid before adding custom rules.

### 1.1: Backend Server Setup
- **Checklist**
    - [ ] `cd` into the `server` directory.
    - [ ] Initialize a Node.js project: `npm init -y`.
    - [ ] Install dependencies: `npm install express socket.io chess.js nodemon`.
    - [ ] Set up a basic Express server in `server.js`.
    - [ ] Integrate Socket.IO with the Express server.
    - [ ] Add a `"start"` script to `package.json`: `"start": "nodemon server.js"`.

### 1.2: Backend Game Logic
- **Checklist**
    - [ ] In `server.js`, create a `games` object to store active game states.
    - [ ] Implement a Socket.IO `connection` handler.
    - [ ] Create a `joinGame` event that allows two players to form a game room. The server should assign 'w' (white) and 'b' (black) to players.
    - [ ] When a game starts, create a new `chess.js` instance for that game room and store it.
    - [ ] Create a `move` event handler. When it receives a move, it should:
        - [ ] Use `chess.js` to validate the move.
        - [ ] If valid, update the game state.
        - [ ] Broadcast the new board position (FEN string) to all players in that room.
        - [ ] If invalid, emit an `invalidMove` event back to the sender.

### 1.3: Frontend Client Setup
- **Checklist**
    - [ ] `cd` into the `client` directory.
    - [ ] Initialize a React project using Vite: `npm create vite@latest . -- --template react`.
    - [ ] Install dependencies: `npm install react-chessboard chess.js socket.io-client tailwindcss postcss autoprefixer`.
    - [ ] Initialize Tailwind CSS: `npx tailwindcss init -p`.
    - [ ] Configure `tailwind.config.js` to watch your component files.

### 1.4: Frontend UI & Logic
- **Checklist**
    - [ ] Create a `GameBoard.jsx` component.
    - [ ] In `GameBoard.jsx`, use `useState` to store the game position (FEN string).
    - [ ] Render the `<Chessboard />` component from `react-chessboard`, passing it the game position.
    - [ ] Set up the Socket.IO client to connect to your backend server.
    - [ ] Implement the `onPieceDrop` function for the chessboard. This function should emit the `move` event to the server with the source and target squares.
    - [ ] Create a listener for the broadcasted board update from the server and update the local game position state.

---

## Phase 2: Implementing the "Secret Queen" Variant

Now for the fun part. This phase involves adding the specific logic for your custom game mode.

### 2.1: Backend Logic for Secret Queen
- **Checklist**
    - [ ] Create a `selectSecretQueen` event handler on the server.
    - [ ] Update the server's `games` object to store the secret queen's starting position for each player (e.g., `game.players.p1.secretQueenStartPos = 'e2'`). This data must remain secret from the other player.
    - [ ] **Crucially, modify the `move` event handler:**
        - [ ] Before validating, check if the piece being moved is a Secret Queen.
        - [ ] **If it is a Secret Queen:**
            - [ ] Create a temporary "hypothetical" `chess.js` instance.
            - [ ] In this instance, replace the pawn with a queen.
            - [ ] Validate the move using this hypothetical board.
            - [ ] If valid, update the *main* game board using `.remove()` and `.put()`.
        - [ ] **If it is a regular piece:**
            - [ ] Validate the move normally using `.move()`.
    - [ ] **Implement the "Post-Move Analysis" logic:**
        - [ ] After any valid move, create a second temporary "Analysis Board".
        - [ ] On this board, place real queens where the Secret Queens are.
        - [ ] Use this Analysis Board to check the true game state (`.in_check()`, `.is_checkmate()`, etc.).
    - [ ] Update the broadcasted game state object to include the true status: `{ fen, isCheck, isCheckmate, turn }`.

### 2.2: Frontend Logic for Secret Queen
- **Checklist**
    - [ ] Create a "selection phase" UI. Before the game starts, players can only click their own pawns.
    - [ ] On pawn click during selection, store the chosen pawn's square in state and emit the `selectSecretQueen` event to the server.
    - [ ] Store the position of the player's *own* Secret Queen in the component's state (`const [mySecretQueen, setMySecretQueen]`).
    - [ ] Use the `customPieces` prop on `<Chessboard />` to render a special visual indicator (a glow, a dot) on the Secret Queen pawn that only its owner can see.
    - [ ] Update the UI to display a "You are in Check!" message when the `isCheck: true` flag is received from the server.

---

## Phase 3: Future-Proofing for More Variants

Refactor your code so that adding a new variant doesn't require rewriting everything.

### 3.1: Backend Refactor
- **Checklist**
    - [ ] Create a base `Game` class. This class will handle common logic like adding players, broadcasting state, etc.
    - [ ] Create a `ClassicChessGame` class that extends `Game`. It will use the standard `chess.js` validation.
    - [ ] Create a `SecretQueenGame` class that also extends `Game`.
    - [ ] In `SecretQueenGame`, **override** the `validateMove` and `getGameState` methods with the special logic you built in Phase 2.
    - [ ] Modify your server to instantiate the correct game class based on a `variant` type received from the client when a game is created.

### 3.2: Frontend Refactor
- **Checklist**
    - [ ] Create a "Lobby" or "New Game" screen.
    - [ ] Add a dropdown menu to this screen for "Select Variant" (`Classic`, `Secret Queen`).
    - [ ] When a player creates a game, send the selected variant type to the server.

---

## Phase 4: Polish & Deployment

The final touches to make the app user-friendly and accessible online.

### 4.1: UI/UX Improvements
- **Checklist**
    - [ ] Add user-friendly notifications (e.g., using a library like `react-toastify`) for events like: "Player 2 has joined", "Invalid move", "You win!".
    * [ ] Add a "Game Over" modal showing the winner and a "Play Again" button.
    - [ ] Implement better visual feedback for whose turn it is.
    - [ ] Handle disconnections gracefully (e.g., end the game or allow reconnection).

### 4.2: Testing
- **Checklist**
    - [ ] Write unit tests for your game logic classes on the backend.
    - [ ] Test edge cases for "Secret Queen":
        - [ ] Can a regular pawn still only move one or two squares?
        - [ ] Does a check from a Secret Queen correctly force the opponent to move out of check?
        - [ ] Is checkmate by a Secret Queen detected properly?

### 4.3: Deployment
- **Checklist**
    - [ ] **Backend Deployment (e.g., Render):**
        - [ ] Create a new "Web Service" on Render.
        - [ ] Connect it to your GitHub repository.
        - [ ] Set the build command (`npm install`) and start command (`node server.js`).
        - [ ] Configure environment variables if needed.
    - [ ] **Frontend Deployment (e.g., Vercel/Netlify):**
        - [ ] Create a new project on Vercel or Netlify.
        - [ ] Connect it to your GitHub repository (client folder).
        - [ ] Configure the build settings (framework should be detected as Vite).
        - [ ] Set the backend server URL as an environment variable in the frontend project (`VITE_API_URL`).