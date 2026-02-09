# Hanabi (Mobile Web)

Live: https://hanabi.stf.lol


https://github.com/user-attachments/assets/42f3af2d-b28c-4e6e-96b0-1f788d818d32



## Features

- Mobile portrait, single-screen gameplay UI
- Peer-to-peer multiplayer over WebRTC data channels (Trystero signaling, no custom backend)
- Deterministic host election (lowest peer id); host is authoritative for turn order + snapshot state
- Reconnect flow that resyncs from the host snapshot
- Hint metadata persists per card (known color/value + excluded colors/values + recent hint indicator)
- Rules-driven implementation based on `rules.md`, including optional multicolor and endless variants
