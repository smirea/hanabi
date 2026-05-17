# Hanabi (Mobile Web)

Live: https://hanabi.stf.lol

https://github.com/user-attachments/assets/42f3af2d-b28c-4e6e-96b0-1f788d818d32

## Features

- Mobile portrait, single-screen gameplay UI
- Multiplayer through a small Bun server with SQLite-backed room action logs
- Server-sent events for live updates across clients
- No hosts: everyone can update lobby settings, and every seated player must ready up to start
- Reconnect flow that restores the server user id from localStorage and reloads room state from the server
- History screen for finished game scores, players, and config
- Hint metadata persists per card (known color/value + excluded colors/values + recent hint indicator)
- Rules-driven implementation based on `rules.md`, including optional multicolor and endless variants
