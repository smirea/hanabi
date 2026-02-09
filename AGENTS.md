# AGENTS

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
