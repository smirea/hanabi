import { describe, expect, test } from 'bun:test';
import { HanabiGame } from './game';

type DeckSuit = 'R' | 'Y' | 'G' | 'B' | 'W' | 'M';
type DeckNumber = 1 | 2 | 3 | 4 | 5;
type DeckCard = {
  suit: DeckSuit;
  number: DeckNumber;
};

const card = (suit: DeckSuit, number: DeckNumber): DeckCard => ({ suit, number });

function twoPlayerDeck(playerOneHand: DeckCard[], playerTwoHand: DeckCard[], tail: DeckCard[] = []): DeckCard[] {
  if (playerOneHand.length !== 5 || playerTwoHand.length !== 5) {
    throw new Error('twoPlayerDeck requires two 5-card hands');
  }

  const deck: DeckCard[] = [];
  for (let index = 0; index < 5; index += 1) {
    deck.push(playerOneHand[index], playerTwoHand[index]);
  }

  deck.push(...tail);
  return deck;
}

function createAlmostWonState(): any {
  const suits: Array<'R' | 'Y' | 'G' | 'B' | 'W'> = ['R', 'Y', 'G', 'B', 'W'];
  const cards: Record<string, any> = {};

  for (const suit of suits) {
    for (const number of [1, 2, 3, 4, 5] as const) {
      const id = `${suit}${number}`;
      cards[id] = {
        id,
        suit,
        number,
        hints: {
          color: null,
          number: null,
          notColors: [],
          notNumbers: [],
          recentlyHinted: false
        }
      };
    }
  }

  cards.extra = {
    id: 'extra',
    suit: 'R',
    number: 1,
    hints: {
      color: null,
      number: null,
      notColors: [],
      notNumbers: [],
      recentlyHinted: false
    }
  };

  return {
    players: [
      { id: 'p1', name: 'A', cards: ['W5'] },
      { id: 'p2', name: 'B', cards: ['extra'] }
    ],
    currentTurnPlayerIndex: 0,
    cards,
    drawDeck: [],
    discardPile: [],
    fireworks: {
      R: ['R1', 'R2', 'R3', 'R4', 'R5'],
      Y: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'],
      G: ['G1', 'G2', 'G3', 'G4', 'G5'],
      B: ['B1', 'B2', 'B3', 'B4', 'B5'],
      W: ['W1', 'W2', 'W3', 'W4'],
      M: []
    },
    hintTokens: 7,
    fuseTokensUsed: 0,
    status: 'active',
    lastRound: null,
    logs: [],
    ui: {
      pendingAction: null,
      selectedCardId: null,
      selectedTargetPlayerId: null,
      selectedHintSuit: null,
      selectedHintNumber: null,
      highlightedCardIds: []
    },
    turn: 1,
    nextLogId: 1,
    settings: {
      includeMulticolor: false,
      multicolorShortDeck: false,
      multicolorWildHints: false,
      endlessMode: false,
      activeSuits: ['R', 'Y', 'G', 'B', 'W'],
      maxHintTokens: 8,
      maxFuseTokens: 3,
      handSize: 5
    }
  };
}

describe('HanabiGame', () => {
  test('initializes a new game with dealt hands and serializable state', () => {
    const deck = twoPlayerDeck(
      [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
      [card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)],
      [card('R', 3), card('Y', 1)]
    );
    const game = new HanabiGame({ playerNames: ['A', 'B'], deck });

    expect(game.state.players).toHaveLength(2);
    expect(game.state.players[0].cards).toHaveLength(5);
    expect(game.state.players[1].cards).toHaveLength(5);
    expect(game.state.drawDeck).toHaveLength(2);
    expect(game.state.hintTokens).toBe(8);
    expect(game.state.fuseTokensUsed).toBe(0);
    expect(game.state.status).toBe('active');
    expect(game.state.ui.pendingAction).toBeNull();
    expect(() => JSON.stringify(game.getSnapshot())).not.toThrow();
  });

  test('color hint selection highlights matching cards and updates hint metadata', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('B', 3), card('W', 4), card('R', 5)],
        [card('G', 1), card('R', 1), card('G', 2), card('B', 2), card('G', 3)],
        [card('Y', 1)]
      )
    });

    game.beginColorHintSelection();
    game.selectHintTarget('p2');
    game.selectHintColor('G');

    const targetCards = game.state.players[1].cards;
    const expectedHighlighted = targetCards.filter((cardId) => game.state.cards[cardId].suit === 'G');
    expect(game.state.ui.highlightedCardIds).toEqual(expectedHighlighted);

    game.confirmSelection();

    expect(game.state.hintTokens).toBe(7);
    expect(game.state.currentTurnPlayerIndex).toBe(1);
    expect(game.state.ui.pendingAction).toBeNull();
    for (const cardId of targetCards) {
      const hintedCard = game.state.cards[cardId];
      if (hintedCard.suit === 'G') {
        expect(hintedCard.hints.color).toBe('G');
        expect(hintedCard.hints.recentlyHinted).toBeTrue();
      } else {
        expect(hintedCard.hints.notColors).toContain('G');
        expect(hintedCard.hints.recentlyHinted).toBeFalse();
      }
    }
  });

  test('number hints update touched and excluded numbers correctly', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('R', 2), card('Y', 2), card('G', 3), card('B', 4), card('W', 2)],
        [card('R', 3)]
      )
    });

    game.giveNumberHint('p2', 2);

    const targetCards = game.state.players[1].cards;
    for (const cardId of targetCards) {
      const hintedCard = game.state.cards[cardId];
      if (hintedCard.number === 2) {
        expect(hintedCard.hints.number).toBe(2);
        expect(hintedCard.hints.recentlyHinted).toBeTrue();
      } else {
        expect(hintedCard.hints.notNumbers).toContain(2);
      }
    }
    expect(game.state.hintTokens).toBe(7);
  });

  test('discard is always allowed and only regains a hint when not already maxed', () => {
    const gameAtMaxHints = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)],
        [card('R', 3), card('Y', 4), card('G', 5)]
      )
    });

    const maxHintCardId = gameAtMaxHints.state.players[0].cards[0];
    gameAtMaxHints.discardCard(maxHintCardId);
    expect(gameAtMaxHints.state.hintTokens).toBe(gameAtMaxHints.state.settings.maxHintTokens);
    expect(gameAtMaxHints.state.logs.at(-1)).toMatchObject({
      type: 'discard',
      gainedHint: false
    });

    const snapshot = gameAtMaxHints.getSnapshot();
    snapshot.hintTokens = 7;
    const game = new HanabiGame({ state: snapshot });
    const currentPlayer = game.state.players[game.state.currentTurnPlayerIndex];
    const cardId = currentPlayer.cards[0];
    const deckBefore = game.state.drawDeck.length;

    game.discardCard(cardId);

    expect(game.state.hintTokens).toBe(8);
    expect(game.state.discardPile.at(-1)).toBe(cardId);
    expect(game.state.drawDeck).toHaveLength(deckBefore - 1);
    expect(game.state.players.find((player) => player.id === currentPlayer.id)?.cards).toHaveLength(5);
    expect(game.state.logs.at(-1)).toMatchObject({
      type: 'discard',
      gainedHint: true
    });
  });

  test('playing a valid card advances fireworks, draws, and advances turn', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)],
        [card('R', 3), card('Y', 1)]
      )
    });

    const cardId = game.state.players[0].cards[0];
    const deckBefore = game.state.drawDeck.length;
    game.playCard(cardId);

    expect(game.state.fireworks.R).toContain(cardId);
    expect(game.state.players[0].cards).toHaveLength(5);
    expect(game.state.drawDeck).toHaveLength(deckBefore - 1);
    expect(game.state.currentTurnPlayerIndex).toBe(1);
    expect(game.state.logs.map((log) => log.type)).toEqual(['play']);
  });

  test('misplays consume fuses and final fuse loss locks further actions', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 2), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
        [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('R', 1), card('Y', 1)]
      )
    });

    const firstCard = game.state.players[0].cards[0];
    game.playCard(firstCard);
    expect(game.state.fuseTokensUsed).toBe(1);
    expect(game.state.status).toBe('active');

    const losingSnapshot = game.getSnapshot();
    losingSnapshot.fuseTokensUsed = 2;
    losingSnapshot.status = 'active';
    losingSnapshot.lastRound = null;
    losingSnapshot.currentTurnPlayerIndex = 0;
    const losingGame = new HanabiGame({ state: losingSnapshot });

    const losingCardId = losingGame.state.players[0].cards.find((candidate) => {
      const candidateCard = losingGame.state.cards[candidate];
      return candidateCard.number !== losingGame.state.fireworks[candidateCard.suit].length + 1;
    });
    expect(losingCardId).toBeDefined();

    losingGame.playCard(losingCardId!);
    expect(losingGame.state.status).toBe('lost');
    expect(losingGame.isGameOver()).toBeTrue();
    expect(() => losingGame.beginPlaySelection()).toThrow('Game is over (lost)');
  });

  test('drawing the final card starts last round and ends after final turns', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
        [card('R', 2), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('G', 5)]
      )
    });

    const openingPlay = game.state.players[0].cards[0];
    game.playCard(openingPlay);
    expect(game.state.drawDeck).toHaveLength(0);
    expect(game.state.status).toBe('last_round');
    expect(game.state.lastRound).toEqual({ turnsRemaining: 2 });
    expect(game.state.currentTurnPlayerIndex).toBe(1);

    game.giveNumberHint('p1', 2);
    expect(game.state.status).toBe('last_round');
    expect(game.state.lastRound).toEqual({ turnsRemaining: 1 });
    expect(game.state.currentTurnPlayerIndex).toBe(0);

    game.giveColorHint('p2', 'R');
    expect(game.state.status).toBe('finished');
    expect(game.state.lastRound).toBeNull();
    expect(game.state.logs.at(-1)).toMatchObject({
      type: 'status',
      status: 'finished',
      reason: 'final_round_complete'
    });
  });

  test('playing the final needed card wins immediately', () => {
    const game = new HanabiGame({ state: createAlmostWonState() });
    game.playCard('W5');

    expect(game.state.fireworks.W).toHaveLength(5);
    expect(game.state.status).toBe('won');
    expect(game.getScore()).toBe(25);
    expect(game.state.logs.at(-1)).toMatchObject({
      type: 'status',
      status: 'won',
      reason: 'all_fireworks_completed',
      score: 25
    });
  });

  test('snapshot restore is isolated from external mutation and remains playable', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('R', 2), card('Y', 3)]
      )
    });
    game.giveNumberHint('p2', 1);

    const snapshot = game.getSnapshot();
    const restored = HanabiGame.fromState(snapshot);

    snapshot.hintTokens = 0;
    snapshot.players[0].name = 'Mutated';
    expect(restored.state.hintTokens).toBe(7);
    expect(restored.state.players[0].name).toBe('A');

    const currentPlayer = restored.state.players[restored.state.currentTurnPlayerIndex];
    const targetPlayer = restored.state.players.find((player) => player.id !== currentPlayer.id)!;
    const hintedNumber = restored.state.cards[targetPlayer.cards[0]].number;
    restored.giveNumberHint(targetPlayer.id, hintedNumber);
    expect(restored.state.turn).toBe(snapshot.turn + 1);
  });

  test('selection API rejects invalid contexts and missing confirmation data', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)],
        [card('R', 3)]
      )
    });

    game.beginPlaySelection();
    expect(() => game.selectHintTarget('p2')).toThrow('Hint target selection is only available for hint actions');
    expect(() => game.confirmSelection()).toThrow('Select a card before confirming play');

    game.beginColorHintSelection();
    game.selectHintTarget('p2');
    expect(() => game.selectHintColor('M')).toThrow('Color M is not active in this game');
  });

  test('rejects invalid player counts and duplicate player ids', () => {
    expect(() => new HanabiGame({ playerNames: ['A'] })).toThrow('Hanabi supports 2 to 5 players');
    expect(() => new HanabiGame({ playerNames: ['A', 'B', 'C', 'D', 'E', 'F'] })).toThrow(
      'Hanabi supports 2 to 5 players'
    );
    expect(() => new HanabiGame({ playerNames: ['A', 'A'] })).toThrow('playerNames must be unique');
    expect(() => new HanabiGame({ playerNames: ['A', 'B'], playerIds: ['same', 'same'] })).toThrow(
      'playerIds must be unique'
    );
  });

  test('rejects invalid starting player index and insufficient deck', () => {
    expect(() => new HanabiGame({ playerNames: ['A', 'B'], startingPlayerIndex: 2 })).toThrow(
      'startingPlayerIndex is out of range'
    );
    expect(() =>
      new HanabiGame({
        playerNames: ['A', 'B'],
        deck: [card('R', 1), card('R', 1), card('R', 1), card('R', 1), card('R', 1), card('R', 1), card('R', 1), card('R', 1), card('R', 1)]
      })
    ).toThrow('Deck must contain at least 10 cards to deal starting hands');
  });

  test('rejects invalid multicolor option combinations', () => {
    expect(() => new HanabiGame({ playerNames: ['A', 'B'], multicolorShortDeck: true })).toThrow(
      'multicolorShortDeck requires includeMulticolor=true'
    );
  });

  test('deals four cards each for four-player games', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B', 'C', 'D'],
      shuffleSeed: 7
    });

    for (const player of game.state.players) {
      expect(player.cards).toHaveLength(4);
    }
    expect(game.state.settings.handSize).toBe(4);
  });

  test('seeded shuffles are deterministic', () => {
    const gameA = new HanabiGame({
      playerNames: ['A', 'B', 'C'],
      includeMulticolor: true,
      shuffleSeed: 1337
    });
    const gameB = new HanabiGame({
      playerNames: ['A', 'B', 'C'],
      includeMulticolor: true,
      shuffleSeed: 1337
    });
    const gameC = new HanabiGame({
      playerNames: ['A', 'B', 'C'],
      includeMulticolor: true,
      shuffleSeed: 7331
    });

    expect(gameA.getSnapshot()).toEqual(gameB.getSnapshot());
    expect(gameA.getSnapshot()).not.toEqual(gameC.getSnapshot());
  });

  test('multicolor deck settings change card composition', () => {
    const baseGame = new HanabiGame({
      playerNames: ['A', 'B'],
      shuffleSeed: 10
    });
    expect(Object.values(baseGame.state.cards).some((entry) => entry.suit === 'M')).toBeFalse();

    const wildHintMulticolorByDefault = new HanabiGame({
      playerNames: ['A', 'B'],
      includeMulticolor: true,
      shuffleSeed: 10
    });
    const defaultMCards = Object.values(wildHintMulticolorByDefault.state.cards).filter((entry) => entry.suit === 'M');
    expect(defaultMCards).toHaveLength(10);
    expect(wildHintMulticolorByDefault.state.settings.multicolorWildHints).toBeTrue();

    const fullMulticolor = new HanabiGame({
      playerNames: ['A', 'B'],
      includeMulticolor: true,
      multicolorShortDeck: false,
      shuffleSeed: 10
    });
    expect(Object.values(fullMulticolor.state.cards).filter((entry) => entry.suit === 'M')).toHaveLength(10);

    const shortMulticolor = new HanabiGame({
      playerNames: ['A', 'B'],
      includeMulticolor: true,
      multicolorShortDeck: true,
      shuffleSeed: 10
    });
    const mCards = Object.values(shortMulticolor.state.cards).filter((entry) => entry.suit === 'M');
    expect(mCards).toHaveLength(5);
    for (const number of [1, 2, 3, 4, 5] as const) {
      expect(mCards.filter((entry) => entry.number === number)).toHaveLength(1);
    }
  });

  test('rejects invalid custom deck cards', () => {
    expect(() =>
      new HanabiGame({
        playerNames: ['A', 'B'],
        deck: [{ suit: 'Z' as DeckSuit, number: 1 }]
      })
    ).toThrow('Invalid suit in deck: Z');

    expect(() =>
      new HanabiGame({
        playerNames: ['A', 'B'],
        deck: [{ suit: 'R', number: 6 as DeckNumber }]
      })
    ).toThrow('Invalid number in deck: 6');
  });

  test('rejects invalid hint targets and hint feasibility rules', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 2), card('G', 3), card('B', 4), card('R', 3)],
        [card('W', 1)]
      )
    });

    expect(() => game.giveColorHint('p1', 'R')).toThrow('Cannot target yourself with a hint');
    expect(() => game.giveColorHint('p2', 'W')).toThrow('Hint must touch at least one card (W)');
    expect(() => game.giveNumberHint('p2', 5)).toThrow('Hint must touch at least one card (5)');

    const noTokenState = game.getSnapshot();
    noTokenState.hintTokens = 0;
    const noTokenGame = new HanabiGame({ state: noTokenState });
    expect(() => noTokenGame.giveColorHint('p2', 'R')).toThrow('Cannot give a hint with zero hint tokens');
  });

  test('number hint selection highlights only matching number cards', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 3), card('G', 2), card('B', 2), card('W', 1)],
        [card('R', 3)]
      )
    });

    game.beginNumberHintSelection();
    game.selectHintTarget('p2');
    game.selectHintNumber(2);

    const expected = game.state.players[1].cards.filter((cardId) => game.state.cards[cardId].number === 2);
    expect(game.state.ui.highlightedCardIds).toEqual(expected);
  });

  test('card selection only accepts cards from current player hand', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)]
      )
    });

    game.beginPlaySelection();
    const otherPlayerCard = game.state.players[1].cards[0];
    expect(() => game.selectCard(otherPlayerCard)).toThrow('Selected card is not in the current player hand');
  });

  test('cancelSelection resets pending ui state', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)]
      )
    });

    game.beginColorHintSelection();
    game.selectHintTarget('p2');
    game.selectHintColor('R');
    expect(game.state.ui.pendingAction).toBe('hint-color');
    expect(game.state.ui.highlightedCardIds.length).toBeGreaterThan(0);

    game.cancelSelection();
    expect(game.state.ui).toEqual({
      pendingAction: null,
      selectedCardId: null,
      selectedTargetPlayerId: null,
      selectedHintSuit: null,
      selectedHintNumber: null,
      highlightedCardIds: []
    });
  });

  test('recentlyHinted flags are cleared by subsequent actions', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 1), card('G', 2), card('B', 2), card('W', 3)],
        [card('R', 2), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 3)]
      )
    });

    game.giveNumberHint('p2', 2);
    const initiallyHinted = game.state.players[1].cards.filter((cardId) => game.state.cards[cardId].number === 2);
    for (const cardId of initiallyHinted) {
      expect(game.state.cards[cardId].hints.recentlyHinted).toBeTrue();
    }

    game.giveNumberHint('p1', 1);
    for (const cardId of initiallyHinted) {
      expect(game.state.cards[cardId].hints.recentlyHinted).toBeFalse();
    }
  });

  test('redundant hints are rejected and do not duplicate exclusions', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('R', 2), card('G', 2), card('Y', 3), card('B', 4), card('W', 5)],
        [card('R', 3)]
      )
    });

    const targetCard = game.state.players[1].cards.find((cardId) => game.state.cards[cardId].suit !== 'R')!;
    game.giveColorHint('p2', 'R');
    game.giveNumberHint('p1', 1);

    const exclusions = game.state.cards[targetCard].hints.notColors.filter((value) => value === 'R');
    expect(exclusions).toHaveLength(1);

    const hintTokensBefore = game.state.hintTokens;
    const currentPlayerBefore = game.state.players[game.state.currentTurnPlayerIndex]?.id ?? null;
    expect(currentPlayerBefore).toBe('p1');

    expect(() => game.giveColorHint('p2', 'R')).toThrow('Hint would provide no new information');
    expect(game.state.hintTokens).toBe(hintTokensBefore);
    expect(game.state.players[game.state.currentTurnPlayerIndex]?.id ?? null).toBe(currentPlayerBefore);

    const exclusionsAfter = game.state.cards[targetCard].hints.notColors.filter((value) => value === 'R');
    expect(exclusionsAfter).toHaveLength(1);
  });

  test('touched hint removes stale exclusions imported via snapshot', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('G', 2), card('R', 2), card('Y', 2), card('B', 2), card('W', 2)],
        [card('R', 3)]
      )
    });

    const targetCardId = game.state.players[1].cards.find((cardId) => game.state.cards[cardId].suit === 'G')!;
    const staleState = game.getSnapshot();
    staleState.cards[targetCardId].hints.notColors.push('G');

    const restored = new HanabiGame({ state: staleState });
    restored.giveColorHint('p2', 'G');

    expect(restored.state.cards[targetCardId].hints.notColors).not.toContain('G');
    expect(restored.state.cards[targetCardId].hints.color).toBe('G');
  });

  test('playing a five regains hint token without exceeding max', () => {
    const needsHintGame = new HanabiGame({ state: createAlmostWonState() });
    needsHintGame.playCard('W5');
    expect(needsHintGame.state.hintTokens).toBe(8);
    expect(needsHintGame.state.logs.find((entry) => entry.type === 'play')).toMatchObject({
      type: 'play',
      gainedHint: true
    });

    const maxedState = createAlmostWonState();
    maxedState.hintTokens = 8;
    const maxHintGame = new HanabiGame({ state: maxedState });
    maxHintGame.playCard('W5');
    expect(maxHintGame.state.hintTokens).toBe(8);
    expect(maxHintGame.state.logs.find((entry) => entry.type === 'play')).toMatchObject({
      type: 'play',
      gainedHint: false
    });
  });

  test('endless mode still stays active when deck empties', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      endlessMode: true,
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
        [card('R', 2), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('G', 5)]
      )
    });

    game.playCard(game.state.players[0].cards[0]);
    expect(game.state.drawDeck).toHaveLength(0);
    expect(game.state.status).toBe('active');
    expect(game.state.lastRound).toBeNull();

    game.giveNumberHint('p1', 2);
    expect(game.state.status).toBe('active');
  });

  test('play/discard selection is blocked when the current player has no cards', () => {
    const baseGame = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
        [card('R', 2), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)]
      )
    });

    const state = baseGame.getSnapshot();
    const emptiedHand = state.players[0].cards.splice(0);
    state.discardPile.push(...emptiedHand);
    state.currentTurnPlayerIndex = 0;
    state.hintTokens = 0;

    const game = new HanabiGame({ state });
    expect(() => game.beginPlaySelection()).toThrow('Cannot play with no cards in hand');
    expect(() => game.beginDiscardSelection()).toThrow('Cannot discard with no cards in hand');
  });

  test('turn automatically skips players who have no legal actions', () => {
    const baseGame = new HanabiGame({
      playerNames: ['A', 'B', 'C'],
      shuffleSeed: 42
    });

    const state = baseGame.getSnapshot();
    const skippedHand = state.players[1].cards.splice(0);
    state.discardPile.push(...skippedHand);
    state.currentTurnPlayerIndex = 0;
    state.hintTokens = 0;

    const game = new HanabiGame({ state });
    const cardId = game.state.players[0].cards.find((candidate) => game.state.cards[candidate].number !== 5)!;
    game.playCard(cardId);

    expect(game.state.currentTurnPlayerIndex).toBe(2);
  });

  test('players with no cards are not skipped when hints are available', () => {
    const baseGame = new HanabiGame({
      playerNames: ['A', 'B', 'C'],
      shuffleSeed: 99
    });

    const state = baseGame.getSnapshot();
    const emptyHand = state.players[1].cards.splice(0);
    state.discardPile.push(...emptyHand);
    state.currentTurnPlayerIndex = 0;
    state.hintTokens = 1;

    const game = new HanabiGame({ state });
    const cardId = game.state.players[0].cards.find((candidate) => game.state.cards[candidate].number !== 5)!;
    game.playCard(cardId);

    expect(game.state.currentTurnPlayerIndex).toBe(1);
  });

  test('actions do not draw cards when deck is already empty', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)],
        [card('R', 2), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)]
      )
    });

    expect(game.state.drawDeck).toHaveLength(0);
    const playedCard = game.state.players[0].cards[0];
    game.playCard(playedCard);
    expect(game.state.players[0].cards).toHaveLength(4);
    expect(game.state.logs.map((entry) => entry.type)).toEqual(['play']);

    const discardState = game.getSnapshot();
    discardState.hintTokens = 7;
    discardState.currentTurnPlayerIndex = 0;
    const discardGame = new HanabiGame({ state: discardState });
    discardGame.discardCard(discardGame.state.players[0].cards[0]);
    expect(discardGame.state.players[0].cards).toHaveLength(3);
    expect(discardGame.state.logs.at(-1)).toMatchObject({ type: 'discard' });
  });

  test('replaceState validates and rejects invalid snapshots', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 2), card('G', 3), card('B', 4), card('W', 5)],
        [card('R', 2), card('Y', 3), card('G', 4), card('B', 5), card('W', 1)]
      )
    });

    const invalid = game.getSnapshot();
    invalid.players[0].cards.push(invalid.players[1].cards[0]);
    expect(() => game.replaceState(invalid)).toThrow('Card appears in multiple zones');
  });

  test('restore validation rejects terminal state with pending action', () => {
    const invalidState = createAlmostWonState();
    invalidState.status = 'lost';
    invalidState.ui.pendingAction = 'play';
    invalidState.ui.selectedCardId = 'W5';
    invalidState.ui.highlightedCardIds = ['W5'];

    expect(() => new HanabiGame({ state: invalidState })).toThrow(
      'No action can be pending when the game is over'
    );
  });

  test('restore validation rejects won state without complete fireworks', () => {
    const invalidState = createAlmostWonState();
    invalidState.status = 'won';
    expect(() => new HanabiGame({ state: invalidState })).toThrow(
      'Won state requires all active fireworks to be complete'
    );
  });

  test('perspective view hides own cards and updates known availability by viewer', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('R', 2), card('Y', 2), card('G', 2), card('B', 2), card('W', 2)]
      )
    });

    const p1View = game.getPerspectiveState('p1');
    const p2View = game.getPerspectiveState('p2');

    const p1OwnCard = p1View.players.find((player) => player.id === 'p1')!.cards[0];
    expect(p1OwnCard.suit).toBeNull();
    expect(p1OwnCard.number).toBeNull();
    expect(p1OwnCard.isHiddenFromViewer).toBeTrue();

    const p1VisibleCard = p1View.players.find((player) => player.id === 'p2')!.cards[0];
    expect(p1VisibleCard).toMatchObject({
      suit: 'R',
      number: 2,
      isHiddenFromViewer: false
    });

    expect(p1View.knownRemainingCounts.R[1]).toBe(3);
    expect(p2View.knownRemainingCounts.R[1]).toBe(2);
  });

  test('perspective view rejects unknown viewer ids', () => {
    const game = new HanabiGame({ playerNames: ['A', 'B'] });
    expect(() => game.getPerspectiveState('missing')).toThrow('Unknown perspective player: missing');
  });

  test('wild multicolor hints treat multicolor cards as matching any color clue', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      includeMulticolor: true,
      multicolorWildHints: true,
      deck: twoPlayerDeck(
        [card('W', 1), card('W', 2), card('W', 3), card('W', 4), card('W', 5)],
        [card('M', 1), card('R', 2), card('Y', 3), card('G', 4), card('B', 5)]
      )
    });

    game.beginColorHintSelection();
    game.selectHintTarget('p2');
    game.selectHintColor('R');

    const targetCards = game.state.players[1].cards;
    const expectedHighlighted = targetCards.filter((cardId) => ['R', 'M'].includes(game.state.cards[cardId].suit));
    expect(game.state.ui.highlightedCardIds).toEqual(expectedHighlighted);

    game.confirmSelection();

    for (const cardId of targetCards) {
      const hintedCard = game.state.cards[cardId];
      const touched = hintedCard.suit === 'R' || hintedCard.suit === 'M';
      if (touched) {
        expect(hintedCard.hints.recentlyHinted).toBeTrue();
        expect(hintedCard.hints.color).toBeNull();
        expect(hintedCard.hints.notColors).toEqual(['Y', 'G', 'B', 'W']);
      } else {
        expect(hintedCard.hints.recentlyHinted).toBeFalse();
        expect(hintedCard.hints.color).toBeNull();
        expect(hintedCard.hints.notColors).toEqual(['R', 'M']);
      }
    }

    expect(() => game.giveColorHint('p2', 'M')).toThrow('Cannot call multicolor when multicolorWildHints=true');
  });

  test('endless mode loses immediately when discarding an indispensable card', () => {
    const tail = [
      card('R', 2), card('R', 3), card('R', 4),
      card('Y', 2), card('Y', 3), card('Y', 4),
      card('G', 2), card('G', 3), card('G', 4),
      card('B', 2), card('B', 3), card('B', 4),
      card('W', 2), card('W', 3), card('W', 4)
    ];

    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      endlessMode: true,
      deck: twoPlayerDeck(
        [card('R', 1), card('Y', 1), card('G', 1), card('B', 1), card('W', 1)],
        [card('R', 5), card('Y', 5), card('G', 5), card('B', 5), card('W', 5)],
        tail
      )
    });

    game.giveNumberHint('p2', 5);

    const r5CardId = game.state.players[1].cards.find((cardId) => {
      const entry = game.state.cards[cardId];
      return entry.suit === 'R' && entry.number === 5;
    });
    expect(r5CardId).toBeDefined();

    const deckBefore = game.state.drawDeck.length;
    game.discardCard(r5CardId!);

    expect(game.state.status).toBe('lost');
    expect(game.state.players[1].cards).toHaveLength(4);
    expect(game.state.drawDeck).toHaveLength(deckBefore);
    expect(game.state.logs.at(-1)).toMatchObject({
      type: 'status',
      status: 'lost',
      reason: 'indispensable_card_discarded'
    });
  });

  test('logs keep sequential ids and expected turn stamps across actions', () => {
    const game = new HanabiGame({
      playerNames: ['A', 'B'],
      deck: twoPlayerDeck(
        [card('Y', 1), card('Y', 2), card('Y', 3), card('Y', 4), card('Y', 5)],
        [card('R', 1), card('B', 1), card('G', 1), card('W', 1), card('R', 2)],
        [card('G', 5)]
      )
    });

    game.giveNumberHint('p2', 1);
    game.playCard(game.state.players[1].cards[0]);

    expect(game.state.logs).toHaveLength(2);
    expect(game.state.logs.map((entry) => entry.id)).toEqual(['log-0001', 'log-0002']);
    expect(game.state.logs.map((entry) => entry.turn)).toEqual([1, 2]);
    expect(game.state.nextLogId).toBe(3);
  });
});
