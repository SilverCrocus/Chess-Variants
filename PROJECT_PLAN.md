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
- [x] Install Node.js and npm/yarn on your computer.
- [x] Install Git.
- [x] Create a main project folder (e.g., `chess-variants-app`).
- [x] Inside the main folder, create two sub-folders: `client` and `server`.
- [x] Open the main folder in VS Code.
- [x] Initialize a Git repository in the main folder (`git init`).
- [x] Create a GitHub repository and push the initial structure.
- [x] Create a `.gitignore` file in the root to ignore `node_modules` in both client and server.

---

## Phase 1: Building the Core Classic Chess Game (MVP)

Focus on making a standard, two-player chess game work perfectly. This ensures your foundation is solid before adding custom rules.

### 1.1: Backend Server Setup
- **Checklist**
    - [x] `cd` into the `server` directory.
    - [x] Initialize a Node.js project: `npm init -y`.
    - [x] Install dependencies: `npm install express socket.io chess.js nodemon`.
    - [x] Set up a basic Express server in `server.js`.
    - [x] Integrate Socket.IO with the Express server.
    - [x] Add a `"start"` script to `package.json`: `"start": "nodemon server.js"`.

### 1.2: Backend Game Logic
- **Checklist**
    - [x] In `server.js`, create a `games` object to store active game states.
    - [x] Implement a Socket.IO `connection` handler.
    - [x] Create a `joinGame` event that allows two players to form a game room. The server should assign 'w' (white) and 'b' (black) to players.
    - [x] When a game starts, create a new `chess.js` instance for that game room and store it.
    - [x] Create a `move` event handler. When it receives a move, it should:
        - [x] Use `chess.js` to validate the move.
        - [x] If valid, update the game state.
        - [x] Broadcast the new board position (FEN string) to all players in that room.
        - [x] If invalid, emit an `invalidMove` event back to the sender.

### 1.3: Frontend Client Setup
- **Checklist**
    - [x] `cd` into the `client` directory.
    - [x] Initialize a React project using Vite: `npm create vite@latest . -- --template react`.
    - [x] Install dependencies: `npm install react-chessboard chess.js socket.io-client tailwindcss postcss autoprefixer`.
    - [x] Initialize Tailwind CSS: `npx tailwindcss init -p`.
    - [x] Configure `tailwind.config.js` to watch your component files.

### 1.4: Frontend UI & Logic
- **Checklist**
    - [x] Create a `GameBoard.jsx` component.
    - [x] In `GameBoard.jsx`, use `useState` to store the game position (FEN string).
    - [x] Render the `<Chessboard />` component from `react-chessboard`, passing it the game position.
    - [x] Set up the Socket.IO client to connect to your backend server.
    - [x] Implement the `onPieceDrop` function for the chessboard. This function should emit the `move` event to the server with the source and target squares.
    - [x] Create a listener for the broadcasted board update from the server and update the local game position state.

---

## Phase 2: Implementing the "Secret Queen" Variant

Now for the fun part. This phase involves adding the specific logic for your custom game mode.

### 2.1: Backend Logic for Secret Queen
- **Checklist**
    - [x] Create a `selectSecretQueen` event handler on the server.
    - [x] Update the server's `games` object (player data) to store `secretQueenInitialSquare`, `secretQueenCurrentSquare`, and `secretQueenTransformed` for each player.
    - [x] In `selectSecretQueen` handler, check if both players have selected and emit `allSecretQueensSelected` to start the game.
    - [x] **Crucially, modify the `move` event handler:**
        - [x] Before validating, check if the piece being moved is the player's untransformed Secret Queen pawn.
        - [x] **If it is the Secret Queen pawn and `isSecretQueenMove: true` is sent from client:**
            - [x] Create a temporary `chess.js` instance to validate the move as if the pawn were a queen.
            - [x] If valid as a queen, update the main game board by removing the pawn and placing a queen (transforming it), and update player's `secretQueenTransformed` and `secretQueenCurrentSquare`.
            - [x] If invalid as a queen, attempt the move as a regular pawn.
        - [x] **If it is the Secret Queen pawn and `isSecretQueenMove` is false/not provided:**
            - [x] Attempt the move as a regular pawn and update `secretQueenCurrentSquare`.
        - [x] **If it is a regular piece (or a transformed Secret Queen):**
            - [x] Validate the move normally using `chess.move()`.
            - [x] If the (already transformed) Secret Queen moves, update its `secretQueenCurrentSquare`.
    - [x] **Implement the "Post-Move Analysis" logic:**
        - [x] After any valid move, create a temporary "Analysis Board" by copying the FEN.
        - [x] On this Analysis Board, temporarily replace all untransformed Secret Queen pawns with actual queens at their current positions.
        - [x] Use this Analysis Board to determine the true game status (`isCheck`, `isCheckmate`, `isDraw`, etc.).
    - [x] Update the broadcasted `boardUpdate` and `gameOver` events to include this `trueGameStatus` object.

### 2.2: Frontend Logic for Secret Queen
- **Checklist**
    - [x] Add `gamePhase` state (`preGame`, `selection`, `playing`).
    - [x] On `gameStart`, transition to `selection` phase and update status message.
    - [x] Implement `handlePawnClickForSelection` (called by `onSquareClick`) to allow players to click their own pawns on the starting rank during the `selection` phase.
    - [x] On valid pawn click during selection, emit `selectSecretQueen` to the server.
    - [x] Add `myPlayerData` state to store player-specific Secret Queen info (`secretQueenInitialSquare`, `secretQueenCurrentSquare`, `secretQueenTransformed`).
    - [x] Update `myPlayerData` based on `gameJoined`, `gameStart`, `secretQueenSelected`, `allSecretQueensSelected`, and `boardUpdate` events.
    - [x] On `allSecretQueensSelected` event from server, transition `gamePhase` to `playing` and update status.
    - [x] In `onPieceDrop`, if moving the untransformed Secret Queen, add `isSecretQueenMove: true` to the move object sent to the server.

### 2.3: UI Enhancements & Status Display
- **Checklist**
    - [x] Use `customSquareStyles` prop on `<Chessboard />` to visually highlight the player's own Secret Queen pawn (before transformation).
    - [x] Refine status messages in `boardUpdate` to clearly indicate the current turn and any check status based on `trueGameStatus`.
    - [x] Ensure `gameOver` messages correctly display the server-provided status (which includes Secret Queen context).
    - [x] Visual distinction for the opponent's Secret Queen *after* it transforms (Optional - may not be needed).
    - [x] Clear indication of whose Secret Queen is which if both are pawns and visible to both (Optional - current highlight is self-only).
    - [x] Update the UI to display a "You are in Check!" message when the `isCheck: true` flag is received from the server.

---

## Phase 2.4: Testing & Refinement
- **Checklist**
    - [ ] Thoroughly test all aspects of the Secret Queen variant:
        - [ ] Player 1 (White) selection and moves.
        - [ ] Player 2 (Black) selection and moves.
        - [ ] Secret Queen pawn moving as a pawn.
        - [ ] Secret Queen pawn moving as a queen (and transforming).
        - [ ] Moves by other pieces.
        - [ ] Check and Checkmate detection (visual vs. true status).
        - [ ] Draw conditions (visual vs. true status).
        - [ ] Game start and end sequences.
        - [ ] Disconnects during selection and play.
    - [ ] Address any bugs or inconsistencies found.
    - [ ] Refine UI messages and interactions for clarity and smoothness.

## Phase 3: Advanced Features & Polish

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
    - [x] Test edge cases for "Secret Queen":
        - [ ] Can a regular pawn still only move one or two squares?
        - [ ] Does a check from a Secret Queen correctly force the opponent to move out of check?
        - [ ] Is checkmate by a Secret Queen detected properly?

### 4.3: Deployment
- **Checklist**
    - [x] **Backend Deployment (e.g., Render):**
        - [ ] Create a new "Web Service" on Render.
        - [ ] Connect it to your GitHub repository.
        - [ ] Set the build command (`npm install`) and start command (`node server.js`).
        - [ ] Configure environment variables if needed.
    - [x] **Frontend Deployment (e.g., Vercel/Netlify):**
        - [ ] Create a new project on Vercel or Netlify.
        - [ ] Connect it to your GitHub repository (client folder).
        - [ ] Configure the build settings (framework should be detected as Vite).
        - [ ] Set the backend server URL as an environment variable in the frontend project (`VITE_API_URL`).