# Secret Queen Chess

## A Custom Chess Variant Game

This project implements "Secret Queen," a unique chess variant where each player secretly designates one of their pawns as a "Secret Queen." This pawn moves like a regular pawn, but has a one-time ability to move like a queen, after which it transforms into a normal queen for the rest of the game. The true game state (check, checkmate) is determined by considering these pawns as queens.

This application features a real-time, two-player online experience.

## Features

*   **Secret Queen Variant Logic:**
    *   Players select a secret pawn at the start of the game.
    *   Untransformed Secret Queen pawns can make a one-time queen-like move, transforming them into actual queens.
    *   Game status (check, checkmate, draw) is determined based on the "true" power of the Secret Queens, even before they transform.
*   **Real-time Multiplayer:** Play against another person online.
*   **Room-Based Games:** Create or join game rooms using simple names.
*   **URL-Based Room Joining:** Join games directly via a shared URL (e.g., `your-app-url.com/room/my-game-room`).
*   **Persistent Player Sessions:** Rejoin games even after accidental disconnection or closing the browser tab.
*   **Automatic Lobby Cleanup:** Game rooms are automatically cleaned up when empty, allowing room names to be reused.
*   **Clear UI:** Visual indicators for selected Secret Queens (visible to self before transformation) and game status.

## Technology Stack

*   **Frontend:**
    *   React (with Vite)
    *   `react-chessboard` for the interactive chessboard UI.
    *   `socket.io-client` for real-time communication.
    *   `react-router-dom` for URL-based navigation.
    *   Tailwind CSS for styling.
*   **Backend:**
    *   Node.js with Express.js
    *   `socket.io` for WebSocket communication and game event handling.
    *   `chess.js` for core chess logic and move validation.
*   **Development:**
    *   `nodemon` for automatic server restarts during development.

## Project Structure

```
chess-variants/
├── client/         # React frontend application
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   └── GameBoard.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
│
├── server/         # Node.js backend server
│   ├── server.js   # Main server logic
│   └── package.json
│
├── .gitignore
├── PROJECT_PLAN.md # Detailed project development plan
└── README.md       # This file
```

## Getting Started

### Prerequisites

*   Node.js (LTS version recommended - includes npm)
*   Git

### Setup & Running Locally

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd chess-variants
    ```

2.  **Install Server Dependencies & Start Server:**
    ```bash
    cd server
    npm install
    npm start
    ```
    The server will typically run on `http://localhost:3001`.

3.  **Install Client Dependencies & Start Client:**
    Open a new terminal window/tab.
    ```bash
    cd client
    npm install
    npm run dev
    ```
    The client development server will typically run on `http://localhost:5173` (or another port if 5173 is busy) and should open in your browser.

4.  **Play!**
    Open two browser windows/tabs to the client URL to simulate two players. Create a room in one tab and join it from the other.

## Future Development (Potential Ideas)

*   Implementation of other chess variants.
*   User accounts and persistent game history.
*   Spectator mode.
*   More advanced UI/UX features (e.g., takeback requests, chat).

## Contributing

Contributions, issues, and feature requests are welcome. Please feel free to check the [issues page](<your-repo-url/issues>) if you want to contribute.

---

_This project was developed as a demonstration of building a real-time multiplayer game with custom logic._
