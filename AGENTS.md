# AGENTS

IMPORTANT: this is a hobby project to be used between friendly friends. It is not a high throughput production critical system. Treat it as a hobby project, always error on the side of simplicity

See `project.md` for overall infrastructure
See `project_animation.md` for what the various animations are and how they are used

## Core Rules

- Use Bun for all tooling: install, dev, build, test, and serve.
- Keep architecture frontend-only: no custom backend APIs.
- Treat `rules.md` as the single source of gameplay truth.
- Build for mobile portrait only.
- Keep gameplay on one screen: avoid multi-screen UX for gameplay. Overlays/drawers are OK for non-critical info (logs/debug) as long as gameplay-critical decisions stay visible.

## Networking

- Use WebRTC data channels for multiplayer.
- Use Trystero (MQTT transport) for no-infra signaling/rendezvous.
- Host election is deterministic (lowest peer id) with ping-based failover.
- Reconnection resyncs from host snapshot; the host broadcasts game state to joining peers automatically.
- `src/utils/networking.ts` is the transport utility (single `Networking` class). Keep it small and generic.
- The utility has two layers:
  - a global player presence room that persists a stable `player.id` plus `peerId`, `name`, and current `room`
  - a per-room game channel that keeps a host-owned state snapshot, applies optimistic follower actions, and elects host internally
- The utility handles stable player ids, room presence, lobby discovery, host election, room rejoin on page reload, and disposal tracking (noops after `.leave()`). Do not move app-specific room logic into it unless there is a clear gap.
- `src/onlineGame.ts` owns everything app-specific: the singleton networking instance, the room state reducer (`applyOnlineRoomAction`), selectors (`selectRoomViewState`, `selectRoomMembers`, `selectRoomDirectoryListings`), and room member/settings logic.
- `src/utils/utils.ts` creates the `LS` (namespaced localStorage) and `useLocalStorage` hook via `createLocalStorage`. Scoped by `debug_id` for multi-instance testing.
- `src/utils/createLocalStorage.ts` is the storage abstraction (copied from tick-tack-toe). All network player persistence goes through `LS.get('player')` / `LS.set({ player })`.
- TV mode is room-local spectator state in `spectatorIds`, not player presence metadata.
- The room directory is intentionally simple: show room code plus player names. Do not add extra complexity unless it is clearly needed.

## Current Status

- The networking layer is a single `Networking` class in `src/utils/networking.ts` (ported from tick-tack-toe).
- `src/ui/game/GameClient.tsx` and `src/ui/LobbyDirectory.tsx` consume Valtio-backed `networking.state` directly via `useSnapshot`.
- Stable player ids (persisted in localStorage) are the Hanabi player ids used in online games.
- Reconnect works by: player id restored from localStorage + room id from URL `?room=` param → auto-rejoin on page load → host broadcasts current game state to the rejoining peer.
- Trystero/WebRTC may emit noisy `RTCErrorEvent` logs during reloads; this is expected.

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
- Networking tests use a `FakeRoom`/`FakeContext` harness with manual time advancement (see `src/utils/networking.test.ts`).

## Manual Browser Testing

To test multiplayer locally, open multiple tabs with different `?debug_id=N` query params. Each debug_id gets its own namespaced localStorage, so each tab acts as a separate player from the same browser session.

1. Open `http://localhost:3000/?debug_id=1` — this is player 1
2. Open `http://localhost:3000/?debug_id=2` — this is player 2
3. Create a room from one tab, join it from the other via the lobby directory or by navigating to `/?room=XXXX&debug_id=2`
4. Start the game from the host tab and play moves

Key scenarios to verify:
- Only the host sees the "Start Game" button and can change settings
- Refreshing a player tab should auto-rejoin the room and restore game state
- Closing the host tab should trigger host election on the remaining player(s)
- WebRTC `RTCErrorEvent` console noise during reloads is expected and harmless

## Deployment

- Dev server: `bun run dev` (port 3000).
- Target deployment is static hosting on S3.
