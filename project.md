# Hanabi Mobile Web - Project Context

## Product Scope
- Mobile-only Hanabi web app.
- Single-screen gameplay UI.
- No in-app text or voice chat.
- Players can coordinate outside the app.

## Rules Source
- Gameplay rules are defined in `rules.md` only.

## Tech Decisions
- Runtime and tooling: Bun.
- UI: React + TypeScript.
- Multiplayer transport: WebRTC data channels.
- WebRTC coordination library: Trystero.
- App runtime: Bun serves `src/index.html` directly.

## Architecture
- Client-only app. No owned backend services.
- Lobby/game state is peer-to-peer.
- Deterministic host election by lowest peer id.
- Host is authoritative for turn order and state snapshots.
- Reconnect flow: rejoin room, request snapshot, resume from sequence.

## Mobile UI Requirements
- Portrait-first design.
- All critical data visible on one screen:
1. Room + connection + turn + deck.
2. Fireworks + hints + fuses.
3. Player lanes and card rows.
4. Action row (hint color, hint number, play, discard, reconnect).

## Card Hint Markings
Each card tracks and renders:
- Known color.
- Known value.
- Excluded colors.
- Excluded values.
- Recent hint indicator.

## Testing Strategy
- Unit and UI behavior: Vitest + Testing Library.
- Add `data-testid` to all actionable controls and critical status fields.
- Keep test ids stable and semantic for long-term maintainability.
- Visual regression: add screenshot-based tests for key mobile states once the main game loop is stable.

## Commands
- `bun run start` to run Bun on `src/index.html`.
- `bun run dev` for local development.
- `bun run build` for production build output in `dist`.
- `bun run preview` to build then serve `dist/index.html`.
- `bun run lint`, `bun run typecheck`, `bun run test`.

## Deployment (Later)
- Final deployment target: static assets in an S3 bucket.
