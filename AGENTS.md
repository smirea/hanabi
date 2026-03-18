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
- Use Trystero for no-infra signaling/rendezvous.
- Host election is deterministic (lowest peer id).
- Reconnection must resync from host snapshot.
- `src/utils/networking.ts` is the transport utility. Keep it small and generic.
- The utility has two layers:
  - a global player presence room that persists a stable `player.id` plus `peerId`, `name`, and current `room`
  - a per-room game channel that keeps a host-owned state snapshot, applies optimistic follower actions, and elects host internally
- The utility already handles stable player ids, room presence, lobby discovery, host election, and room rejoin on load. Do not move app-specific room logic into it unless there is a clear gap.
- The app-level online implementation lives in `src/onlineRoom.ts` and `src/onlineRoomShared.ts`.
- `src/onlineRoom.ts` owns the singleton networking instance, Valtio state exposed to the UI, room join/leave flow, simple lobby directory data, and cached in-progress room restore/reconnect behavior.
- `src/onlineRoomShared.ts` owns the actual room reducer rules and selectors for the Hanabi room state: `{ phase, settings, gameState, spectatorIds }`.
- TV mode is room-local spectator state in `spectatorIds`, not player presence metadata.
- The room directory is intentionally simple: show room code plus player names. Do not add extra complexity unless it is clearly needed.
- Keep `src/utils/networking.ts` unchanged unless the app truly cannot be built around its existing API.

## Current Status

- The legacy networking stack (`src/network*.ts`, `src/roomDirectory.ts`, old host-election helpers, and `src/debugNetwork.ts`) has been removed.
- Real online play now goes through the `onlineRoom` store, while local debug mode remains separate.
- `src/ui/game/GameClient.tsx` and `src/ui/LobbyDirectory.tsx` consume the Valtio-backed `onlineRoom` state directly.
- Stable player ids are the Hanabi player ids used in online games.
- Reconnect currently relies on cached room snapshots in `src/onlineRoom.ts` to restore in-progress games while the transport reconnects.
- Real browser testing in this refactor covered create, join, start, action sync, follower reload recovery, and host reload recovery. Trystero/WebRTC may still emit noisy `RTCErrorEvent` logs during reloads.

## UI and State

- Show all gameplay-critical info on the main screen.
- Keep the UI clean and simple: avoid scoreboard-like side info, extra helper copy, or notification-board clutter unless it is strictly required for immediate gameplay decisions.
- Own cards are hidden but hint metadata is always visible.
- Persist clue metadata per card: known color/value and exclusions.

## Testing Guidance

- Add stable `data-testid` attributes to every interactive control and critical status field.
- Test id format: `section-element` or `entity-id-index`.
- Preferred lightweight UI testing stack: Vitest + Testing Library.
- Add visual regression checks as screenshot tests for key mobile states once flows stabilize.

## Playwright Guidance

- When using Playwright (CLI), always resize the viewport to a representative mobile portrait size before debugging flows.
- Recommended default: `390x844` (common iPhone portrait).
- Example (CLI): `pwcli resize 390 844`
- DevTools “device toolbar” emulation is not reliably toggleable via Playwright CLI; prefer viewport sizing, and optionally set `isMobile/hasTouch/deviceScaleFactor` via a `playwright-cli.json` config when needed.

## Deployment

- Local runtime uses `bun ./src/index.html` via `bun run start`.
- Target deployment is static hosting on S3 at the end of implementation.
