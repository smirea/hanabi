# Project Animations (motion.dev + CSS)

## Goals

1. Hint tokens (light bulbs)
- Fade away when used.
- Light up + grow when gained.

2. Draw animation
- New card flies from deck to the correct hand slot (any player).
- Duration: 0.5s.
- At the start: deck counter ticks down by 1 with an animated counter effect.

3. Hint metadata on cards
- Enter animation when hints are applied.

4. Play animation
- Card travels from player hand to the correct fireworks peg.
- Motion: zoom up slightly, then shrink while traversing to peg.
- If played from your own hand: start with a flip to reveal the real card.

4.1 Misplay animation
- Zoom up.
- Card cracks/explodes.
- Then a fuse flame extinguishes (grow slightly then fade) before settling into hollow.

4.2 Turn timing
- Turn indicator and action availability should not advance to the next player until the full card animation sequence completes.

5. Last action ticker
- When a new (potentially long) entry appears in the bottom "Last" strip, slide the new one in and slide the old one out.

## Implementation Notes

- Prefer animation driven by state deltas + logs (play/discard/hint logs exist; draw is inferred by hand/deck diff).
- Use a fixed-position overlay layer for traveling card ghosts.
- Keep gameplay state authoritative; UI freezes turn/actionability while animation is in progress.
- Store Playwright artifacts under `output/playwright/` (gitignored).

## Task Breakdown (live)

- [x] Add `motion` dependency + small animation utilities.
- [x] Add animation overlay layer + element refs (deck, cards, pegs, tokens).
- [x] Hint tokens: spend/gain animations.
- [x] Fuse tokens: extinguish animation for misplays.
- [x] Deck counter: animated tick on decrement.
- [x] Draw animation (0.5s) from deck to new card.
- [x] Hint enter animation on touched cards.
- [x] Play success animation (hand -> peg), including own-hand flip.
- [x] Misplay card crack/explode sequence + delayed fuse extinguish.
- [x] Turn freeze gating (no turn advance in UI until animation done).
- [x] Last-action ticker slide in/out.
- [x] Playwright verification + screenshots/traces.

## Progress Log

- 2026-02-09: Initialized animation work tracker.
- 2026-02-09: Added `motion@12.34.0`, plus deck count + last-action tickers in `src/App.tsx`.
- 2026-02-09: Added motion overlay layer + rect snapshotting (`useLayoutEffect`) to animate removed cards after state updates.
- 2026-02-09: Implemented token FX (bulbs spend/gain, fuse extinguish) via CSS keyframes and class triggers on the SVG nodes.
- 2026-02-09: Implemented draw (0.5s) from deck pill -> drawn card slot with a deck counter tick at the start.
- 2026-02-09: Implemented hint enter on touched cards (badge pop + card bump + ring pulse).
- 2026-02-09: Implemented play success (zoom + optional flip + traverse/shrink into peg + peg pulse) and misplay (zoom + optional flip + crack/explode + fuse extinguish).
- 2026-02-09: Turn gating: while play/discard animations run, keep turn indicator on actor and disable actions. This is skipped when `prefers-reduced-motion` is on or WAAPI is unavailable (keeps unit/UI tests stable).
- 2026-02-09: Playwright artifacts captured under `output/playwright/animations/.playwright-cli/` (screenshots, 2 videos, and one trace file).
