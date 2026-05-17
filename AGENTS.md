# AGENTS

IMPORTANT: this is a hobby project to be used between friendly friends. It is not a high throughput production critical system. Treat it as a hobby project, always error on the side of simplicity

See `project.md` for overall infrastructure
See `project_animation.md` for what the various animations are and how they are used

## Core Rules

- Use Bun for all tooling: install, dev, build, test, and serve.
- Keep the backend small: a Bun API server plus SQLite is enough.
- Treat `rules.md` as the single source of gameplay truth.
- Build for mobile portrait only.
- Keep gameplay on one screen: avoid multi-screen UX for gameplay. Overlays/drawers are OK for non-critical info (logs/debug) as long as gameplay-critical decisions stay visible.

## Networking

- Multiplayer uses the Bun server in `server/src/index.ts`.
- Game state is derived by replaying the initial room state plus all stored room actions.
- Use server-sent events for live room updates.
- There are no hosts or host election. Any room member can update lobby settings.
- Starting a game requires all seated players to ready up.
- The client stores the server user id in debug_id-scoped localStorage via `server_user_id`.
- `shared/onlineGame.ts` owns the room action types, reducer, selectors, and shared constants.
- `client/src/hooks/useGameServer.ts` owns client API/SSE wiring.
- TV mode is room-local spectator state in `spectatorIds`, not player presence metadata.
- The room directory is intentionally simple: show room code plus player names. Do not add extra complexity unless it is clearly needed.

## Database

- SQLite stores users, rooms, and room actions.
- Drizzle table definitions live in `server/src/index.ts`.
- Use Drizzle for all runtime DB operations: select, insert, update, delete, and returning rows.
- Do not use raw SQL strings, `sqlite.prepare`, or direct `DELETE FROM`/`SELECT`/`UPDATE`/`INSERT` for app behavior.
- Raw `sqlite.exec` is only acceptable for bootstrapping schema, indexes, PRAGMAs, or tiny migrations that Drizzle does not handle here.

## Current Status

- The frontend lives in `client/`, shared game/reducer code lives in `shared/`, and the Bun API server lives in `server/`.
- Stable server user ids are persisted in localStorage and converted to Hanabi player ids as `player:${user.id}`.
- Reconnect works by: user id restored from localStorage + room id from URL `?room=` param -> POST join if needed -> GET/SSE current room state from the server.
- Room history is built from terminal games found while replaying room actions.

## UI and State

- Show all gameplay-critical info on the main screen.
- Keep the UI clean and simple: avoid scoreboard-like side info, extra helper copy, or notification-board clutter unless it is strictly required for immediate gameplay decisions.
- Own cards are hidden but hint metadata is always visible.
- Persist clue metadata per card: known color/value and exclusions.

## Testing Guidance

- Run tests with `bun test`. Tests use `bun:test` (not vitest).
- Add stable `data-testid` attributes to every interactive control and critical status field.
- Test id format: `section-element` or `entity-id-index`.
- UI component tests use Testing Library.
- Shared room-action tests live around `client/src/onlineGame.test.ts`.

## Manual Browser Testing

To test multiplayer locally, open multiple tabs with different `?debug_id=N` query params. Each debug_id gets its own namespaced localStorage, so each tab acts as a separate player from the same browser session.

1. Open `http://localhost:3000/?debug_id=1` — this is player 1
2. Open `http://localhost:3000/?debug_id=2` — this is player 2
3. Create a room from one tab, join it from the other via the lobby directory or by navigating to `/?room=XXXX&debug_id=2`
4. Ready up from every seated player tab and play moves

Key scenarios to verify:

- Any player can change settings in the lobby
- The game starts only after every seated player is ready
- Refreshing a player tab should auto-rejoin the room and restore game state
- Game actions should update other tabs through SSE

## Deployment

- Dev server: `bun run dev` (port 3000).
- Production deployment now needs the Bun API server plus SQLite storage; static-only S3 hosting is no longer enough.
