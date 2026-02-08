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
- Reconnect flow: rejoin room, request snapshot, resume from host snapshot.

## Mobile UI Requirements
- Portrait-first design.
- All gameplay-critical data visible on one screen:
1. Fireworks + hints + fuses + deck.
2. Player lanes and card rows.
3. Action row (hint color, hint number, play, discard, reconnect).

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

## Deployment (Production)
- Runtime target: `https://hanabi.stf.lol`.
- AWS architecture: private S3 bucket `stf.lol` with app assets under `s3://stf.lol/hanabi/`, served through CloudFront distribution `EF8ZR6OCMZQ48` (`d1yq9wamlmytcc.cloudfront.net`).
- TLS certificate: ACM certificate in `us-east-1` for `*.stf.lol` (also covering `stf.lol`), attached to CloudFront.
- DNS (Namecheap):
  - `hanabi` CNAME -> `d1yq9wamlmytcc.cloudfront.net`.
  - ACM DNS validation CNAME must remain in place for certificate renewals.
- CI/CD: GitHub Actions workflow in `.github/workflows/deploy.yml`.
  - Trigger: every push to `master` (plus manual `workflow_dispatch`).
  - Flow: install -> lint -> typecheck -> tests -> build -> sync `dist` to `s3://stf.lol/hanabi/` -> CloudFront invalidation.
  - Cache strategy: hashed assets are uploaded with long-lived immutable cache headers; `index.html` is uploaded with no-cache headers.
- Required GitHub repository secrets:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
