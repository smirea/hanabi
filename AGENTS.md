# AGENTS

## Core Rules
- Use Bun for all tooling: install, dev, build, test, and serve.
- Keep architecture frontend-only: no custom backend APIs.
- Treat `rules.md` as the single source of gameplay truth.
- Build for mobile portrait only.
- Keep gameplay on one screen: no popups, drawers, or hidden panels.

## Networking
- Use WebRTC data channels for multiplayer.
- Use Trystero for no-infra signaling/rendezvous.
- Host election is deterministic (lowest peer id).
- Reconnection must resync from host snapshot.

## UI and State
- Show all gameplay-critical info on the main screen.
- Own cards are hidden but hint metadata is always visible.
- Persist clue metadata per card: known color/value and exclusions.

## Testing Guidance
- Add stable `data-testid` attributes to every interactive control and critical status field.
- Test id format: `section-element` or `entity-id-index`.
- Preferred lightweight UI testing stack: Vitest + Testing Library.
- Add visual regression checks as screenshot tests for key mobile states once flows stabilize.

## Deployment
- Local runtime uses `bun ./src/index.html` via `bun run start`.
- Target deployment is static hosting on S3 at the end of implementation.
