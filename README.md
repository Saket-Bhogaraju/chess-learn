# ♟ ChessMind

A free, open-source chess learning platform. Play against Stockfish, get AI move reviews, and learn openings interactively.

## Features

- **Play Mode** — Play against Stockfish at 10 difficulty levels (Beginner → Expert). After the game, an AI coach reviews your key moves and asks about your reasoning on blunders.
- **Opening Trainer** — Learn openings interactively. Real variation data from Lichess master games. Click any continuation to explore it, with AI explanations for each move.

## Stack

| Piece | Tool |
|---|---|
| Chessboard UI | chessboard.js + chess.js |
| Engine | Stockfish WASM (runs in browser) |
| AI review | Groq API (Llama 3, free tier) |
| Opening data | Lichess Open Database API |
| Hosting | GitHub Pages |

**100% free. No backend. No ads.**

## Setup

1. Clone or fork this repo
2. Enable GitHub Pages (Settings → Pages → Deploy from `main` branch)
3. Visit your Pages URL
4. Paste your free [Groq API key](https://console.groq.com) in the top bar for AI features

## Local Development

Just open `index.html` in your browser — no build step needed.

## Contributing

PRs welcome! Ideas for future features:
- Puzzle trainer
- Game import (PGN)
- Opening quiz mode
- Move sound effects
