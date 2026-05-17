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
- Client runtime: Vite in `client/`.
- Server runtime: Bun API server in `server/`.
- Storage: SQLite through Drizzle.
- Multiplayer transport: HTTP actions plus server-sent events.

## Architecture

- `client/` contains the mobile React app.
- `server/` contains the Bun API and SSE server.
- `shared/` contains the game engine and room reducer shared by client and server.
- Room state is inferred from the initial room state plus the SQLite room action log.
- There are no hosts. Any room member can update lobby settings.
- Game start requires every seated player to ready up.
- Reconnect flow: restore server user id from localStorage, rejoin the room from `?room=`, then receive the latest room state through GET/SSE.

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

- Unit and UI behavior: `bun:test` + Testing Library.
- Add `data-testid` to all actionable controls and critical status fields.
- Keep test ids stable and semantic for long-term maintainability.
- Visual regression: add screenshot-based tests for key mobile states once the main game loop is stable.

## Commands

- `bun run dev` for local development (`client` on port 3000, API on port 3001 by default).
- `bun run build` for production client build output in `client/dist`.
- `bun run preview` to build and run the Bun server with `SERVE_CLIENT=1` so `/api` and the client share one origin.
- `bun run lint`, `bun run typecheck`, `bun run test`.

## Deployment (Production)

- Runtime target: `https://hanabi.stf.lol`.
- The old static-only S3/CloudFront deployment is no longer sufficient because multiplayer now requires the Bun API server and SQLite.
- Previous AWS static architecture: private S3 bucket `stf.lol` with app assets under `s3://stf.lol/hanabi/`, served through CloudFront distribution `EF8ZR6OCMZQ48` (`d1yq9wamlmytcc.cloudfront.net`).
- TLS certificate: ACM certificate in `us-east-1` for `*.stf.lol` (also covering `stf.lol`), attached to CloudFront.
- DNS (Namecheap):
  - `hanabi` CNAME -> `d1yq9wamlmytcc.cloudfront.net`.
  - ACM DNS validation CNAME must remain in place for certificate renewals.
- CI: GitHub Actions workflow in `.github/workflows/ci.yml`.
  - Trigger: pull requests + every push to `master`.
  - Flow: lint/typecheck + tests + build (uploads `client/dist` as the `client-dist` artifact).
- CD: GitHub Actions workflow in `.github/workflows/deploy.yml`.
  - Current status: disabled and manual-only because static S3/CloudFront deployment cannot run the Bun API/SSE server or SQLite storage.
  - Before re-enabling: choose server hosting, persistent `DATABASE_URL` storage, and routing for the client plus `/api`/SSE traffic. The Bun server can serve the built client when `SERVE_CLIENT=1`.
  - Previous cache strategy: hashed static assets used long-lived immutable cache headers; `index.html` used no-cache headers.
- Previous GitHub repository secrets for static deployment:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
