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

6. UX polish + guards
- Prevent redundant hints (no-op color/number hints) and provide animated feedback on the already-hinted cards.
- Selection state should be shown via animated/selected action buttons (not by writing "Number hint selected" in the last-action strip).
- Last-action strip should be tall enough that log chips (card symbols) are not clipped.
- Discarding should reveal the card and use an explosion/crack animation.
- Increase play/discard/misplay animation sequences to ~1.0s (draw stays 0.5s).

## Animation Specs (Acceptance)

### 1. Hint Tokens (Light Bulbs)
- Trigger: after a completed turn (`turn` increments by 1) when `hintTokens` changes.
- Spend: the bulb that becomes hollow fades/shrinks with a warm glow.
- Gain: the bulb that becomes filled lights up and grows slightly with a warm glow.
- Duration: spend ~420ms, gain ~520ms.

### 1b. Fuse Tokens (Flames)
- Trigger: after a misplay that consumes a fuse.
- Look: flame grows slightly, then fades/shrinks to the hollow token state.
- Duration: ~540ms.

### 2. Deck Counter Tick
- Trigger: whenever `drawDeckCount` changes.
- Look: digits slide vertically (down for decrement, up for increment).
- Duration: ~260ms.

### 2b. Draw (Deck -> Hand Slot)
- Trigger: after `play` or `discard` when the acting player draws (deck delta `-1` and a new card appears in that actor’s hand).
- Look: a ghost card launches from the center of the deck pill and lands into the new card slot with a small overshoot.
- Duration: 0.5s for the flight + ~0.16s for destination fade-in.
- Privacy: if the viewer is not the drawing player, the ghost shows the real face (suit/number). If the viewer drew, it stays face-down.
- Deck count: should tick down immediately as the draw begins (before the card arrives).

### 3. Hint Metadata Enter (Badges)
- Trigger: on a `hint` log entry; animate every card in `touchedCardIds`.
- Look: card bumps slightly, badge pops, and an orange ring pulses.
- Duration: card bump ~520ms, badge pop ~460ms, ring ~680ms.

### 3b. Redundant Hint Feedback (No-Op Hint)
- Trigger: when attempting a hint that would provide no new information (applying it would not change any hint metadata).
- Behavior: the action is rejected (no token spend, no turn advance).
- Look: touched cards shake; existing positive hint badges turn red and enlarge slightly; red ring pulse.
- Duration: ~520ms.

### 4. Play Success (Hand -> Peg)
- Trigger: on a `play` log entry with `success=true`.
- Look: ghost card zooms up slightly, optionally flips (when playing from your own hidden hand), then travels to the target peg while shrinking and fading.
- Duration: ~1.0s total (zoom+optional flip ~0.34s, travel/shrink ~0.66s).
- Peg response: target peg pulses (`peg-hit`).

### 4.1 Misplay (Wrong Play)
- Trigger: on a `play` log entry with `success=false`.
- Look: zoom + optional flip, then crack/explode and fade.
- Duration: ~1.0s total (zoom+optional flip ~0.34s, explode/fade ~0.66s).
- Fuse response: the spent fuse flame extinguishes (grow then fade) after the card zoom/flip.

### 4.2 Discard (Explode + Reveal)
- Trigger: on a `discard` log entry.
- Look: zoom + optional flip to reveal, then crack/explode and fade.
- Duration: ~1.0s total (same timing as misplay).
- Token response: if discard regains a hint, bulbs animate via “gain” above.

### 4.3 Turn Freeze / Gating
- Trigger: `play` or `discard` logs only.
- Behavior: while the card animation sequence runs, keep the turn indicator on the actor and disable action buttons. Advance the UI turn only after animations complete.
- Note: gating is skipped when `prefers-reduced-motion` is enabled or WAAPI is unavailable.

### 5. Last Action Ticker
- Trigger: when the newest log entry changes.
- Look: previous text slides out upward while new text slides in from below.
- Duration: ~320ms.
- Layout: the strip must be tall enough that card chips (icons) never clip.

### 6. Action Button Selection (No “Selected” Log Spam)
- Behavior: do not display “Play selected” / “Number hint selected” in the bottom strip.
- Look: selected action button shows a subtle looping glow/pulse until selection resolves or is cleared.

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
- [x] Redundant hint guard + "shake red" feedback (cards touched).
- [x] Action button selected/pulse UX (remove pending-action text from last strip).
- [x] Fix last-action strip clipping (increase height for chips).
- [x] Discard animation: flip reveal (own hand) + explode/crack.
- [x] Increase play/discard/misplay sequences to ~1.0s.
- [x] Playwright verification update for the new sequences.

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
- 2026-02-09: Prevented redundant hints (UI + game rules); redundant attempts shake + highlight the already-hinted badges in red and do not consume a token or advance the turn.
- 2026-02-09: Removed pending-action text from the bottom "Last" strip; action selection is now represented via animated/selected action buttons.
- 2026-02-09: Fixed bottom "Last" strip clipping by increasing ticker/row height to fit log chips.
- 2026-02-09: Added discard explosion animation (with flip reveal for the acting player's hidden hand) and increased play/discard/misplay sequences to ~1.0s (draw stays 0.5s).
- 2026-02-09: Playwright update artifacts captured under `output/playwright/animations-ux/`, `output/playwright/animations-actions/`, and `output/playwright/animations-misplay2/`.
