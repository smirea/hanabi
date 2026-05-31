# Hanabi Rules (R&R Games Edition, Base + Variants)

## Summary

Hanabi is a cooperative card game. Players can see everyone else’s cards but not their own. The team builds fireworks (one stack per color) in ascending order from 1 to 5.

## Components

- 60 cards in 6 suits (white, red, blue, yellow, green, multicolor)
  - Each suit has: three 1s, two 2s, two 3s, two 4s, one 5
- 8 blue information tokens
- 4 black fuse tokens

## Setup (Base Game)

1. Place the 8 blue information tokens face up on the table.
2. Place the 4 black fuse tokens nearby with the longest fuse on top and the explosion on the bottom.
3. Remove the multicolor suit unless playing a multicolor variant.
4. Shuffle the deck and place it face down.
5. Deal hands (players must not look at their own cards):
   - 2 or 3 players: 5 cards each
   - 4 or 5 players: 4 cards each
6. The player with the most colorful clothing starts. Play proceeds clockwise.

## Objective

Complete the fireworks by building each color stack in order 1 through 5.

## Turn Structure

On your turn, you must take exactly one of the following actions (no skipping):

1. Give one piece of information
2. Discard a card
3. Play a card

## Actions

### 1. Give One Piece of Information

- Take one blue token from the table and place it in the box lid (spending it).
- Choose one teammate and give **one** of the following:
  - A single **color** (e.g., “You have two green cards”), or
  - A single **value** (e.g., “You have one 5”).
- You must point to **all** cards matching the color or value.
- You **cannot** say “you have zero of something,” because you must point to at least one card.
- If there are no blue tokens on the table, this action is not allowed.
- Implementation rule (this app): You **cannot** give a hint that would provide **no new information** (a redundant hint). A hint is redundant if applying it would not change any hint metadata on the target player’s cards.

### 2. Discard a Card

- Announce the discard and place one of your cards face up in the discard pile.
- Return one blue token from the lid to the table (if any are in the lid).
- Draw a replacement card if the deck is not empty.
- If all blue tokens are already on the table, you cannot discard.

### 3. Play a Card

- Play one card from your hand to the table.
- If it correctly starts or continues a firework, add it to that firework.
- If it does **not** correctly start or continue a firework, discard it and move the top black fuse token to the lid.
- Draw a replacement card if the deck is not empty.

## Building Fireworks

- Each firework is a single color and must be built in ascending order: 1, 2, 3, 4, 5.
- Only one card of each value can be in a firework.

## Bonus

- When a player completes a firework by playing a 5, move one blue token from the lid back to the table (if any are in the lid).

## End of the Game

The game ends in one of three ways:

1. **Immediate loss:** The third black fuse token is added to the lid.
2. **Immediate win:** All fireworks are completed before the deck runs out.
3. **Last round:** When the last card is drawn, each player (including the player who drew it) takes one final turn. No cards are drawn during this final round.
4. **Implementation finish:** If no incomplete firework can advance because none of the next required cards are left in player hands or the deck, the game finishes with the current score.

## Scoring

Add the highest value card in each completed firework. The maximum score is 25 for the base game (5 suits). If using the multicolor suit, include it in the score.

### Score Scale (Optional Flavor)

- 0-5: poo crew
- 6-10: shovel duty
- 11-15: donkey mode
- 16-20: chariot chaos
- 21-25: crowned somehow
- If variants raise the maximum score above 25, continue the flavor scale:
  - 26-30: Elon eyebrow
  - 31+: Starship nonsense

## Expansions and Variants

The lobby can enable any supported expansion before players ready up. Changing any setting clears ready status.

### Colour Avalanche / Extra Suit

- Add the multicolor suit and build it like any other firework.
- This app uses the short-deck version: one multicolor card of each value (1-5).
- You cannot call "multicolor" for color clues.
- To clue a multicolor card, call a base color (white/red/blue/yellow/green); multicolor cards count as matching that color for clues.
- Number clues work normally.

### Black Powder

- Add the black suit to the deck.
- Black is a sixth firework, but it is built in descending order: 5, 4, 3, 2, 1.
- Black cards are colorless. You cannot give black color information, and black cards are not included in other color clues.
- Number clues work normally.
- Completing the black firework with the 1 gives the normal completed-firework bonus.
- Black scoring is a penalty, not a normal firework score: subtract 1 point for each missing black card. With only the base suits plus Black Powder, the maximum score is still 25.

### 5 Flamboyants

- Shuffle the six bonus tiles face down near the draw deck during setup.
- When a player completes a normal firework by playing a 5, reveal and resolve one bonus tile instead of taking the normal clue-token bonus.
- Bonus tile effects:
  - Gain 1 clue token.
  - Gain 1 clue token and recover 1 fuse token. If no fuse has been spent, only gain the clue.
  - Give 1 free color clue.
  - Give 1 free number clue.
  - Choose a card from the discard pile and shuffle it back into the draw deck. If the deck is empty, the player may instead use the "play from discard" effect.
  - Choose a card from the discard pile and add it to the matching firework if it is currently playable. If no discarded card is playable, the effect is lost. If this plays a 5, immediately reveal and resolve another bonus tile.

### Sudden Death

- The game does not end after the last card is drawn.
- The team has only 1 fuse token.
- The game continues until the team is defeated (the fuse token is used, or an indispensable card is discarded) or victorious (all fireworks completed).
- Score scale is not used; the goal is perfection.
- This variant can be combined with one other variant.
