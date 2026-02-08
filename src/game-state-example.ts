import type { Card, CardHints, CardId, CardNumber, GameLogEntry, GameState, Suit } from './types';

const hint = (partial: Partial<CardHints> = {}): CardHints => ({
  color: null,
  number: null,
  notColors: [],
  notNumbers: [],
  ...partial
});

const createCard = (
  id: CardId,
  suit: Suit,
  number: CardNumber,
  partialHint: Partial<CardHints> = {}
): Card => ({
  id,
  suit,
  number,
  hints: hint(partialHint)
});

const allCards: Card[] = [
  createCard('r1-p', 'R', 1),
  createCard('r2-p', 'R', 2),
  createCard('r3-p', 'R', 3),
  createCard('r4-p', 'R', 4),
  createCard('r5-p', 'R', 5),
  createCard('g1-p', 'G', 1),
  createCard('g2-p', 'G', 2),
  createCard('b1-p', 'B', 1),
  createCard('b2-p', 'B', 2),
  createCard('b3-p', 'B', 3),
  createCard('w1-p', 'W', 1),
  createCard('m1-p', 'M', 1),
  createCard('m2-p', 'M', 2),
  createCard('m3-p', 'M', 3),
  createCard('m4-p', 'M', 4),

  createCard('b4-d1', 'B', 4),
  createCard('b4-d2', 'B', 4),
  createCard('y1-d1', 'Y', 1),
  createCard('y2-d1', 'Y', 2),
  createCard('y3-d1', 'Y', 3),
  createCard('w5-d1', 'W', 5),
  createCard('g5-d1', 'G', 5),
  createCard('m5-d1', 'M', 5),
  createCard('r1-d1', 'R', 1),
  createCard('w2-d1', 'W', 2),

  createCard('you-0', 'Y', 4, {
    color: 'Y'
  }),
  createCard('you-1', 'W', 3),
  createCard('you-2', 'B', 5, {
    notColors: ['R', 'Y'],
    notNumbers: [1, 2]
  }),
  createCard('you-3', 'G', 3, {
    color: 'G',
    number: 3
  }),
  createCard('you-4', 'R', 2, {
    notColors: ['W', 'M'],
    notNumbers: [5]
  }),

  createCard('p2-0', 'Y', 1, {
    color: 'Y',
    number: 1
  }),
  createCard('p2-1', 'W', 4),
  createCard('p2-2', 'M', 2, {
    color: 'M'
  }),
  createCard('p2-3', 'G', 4),
  createCard('p2-4', 'B', 2, {
    number: 2
  }),

  createCard('p3-0', 'R', 1, {
    color: 'R'
  }),
  createCard('p3-1', 'Y', 4, {
    number: 4
  }),
  createCard('p3-2', 'B', 1),
  createCard('p3-3', 'W', 1, {
    number: 1
  }),
  createCard('p3-4', 'W', 2),

  createCard('p4-0', 'G', 1, {
    color: 'G',
    number: 1
  }),
  createCard('p4-1', 'M', 1),
  createCard('p4-2', 'Y', 5, {
    number: 5
  }),
  createCard('p4-3', 'R', 3),
  createCard('p4-4', 'M', 4, {
    color: 'M'
  }),

  createCard('deck-01', 'Y', 1),
  createCard('deck-02', 'Y', 1),
  createCard('deck-03', 'Y', 2),
  createCard('deck-04', 'Y', 4),
  createCard('deck-05', 'Y', 5),
  createCard('deck-06', 'G', 3),
  createCard('deck-07', 'G', 4),
  createCard('deck-08', 'W', 3),
  createCard('deck-09', 'W', 4),
  createCard('deck-10', 'B', 5),
  createCard('deck-11', 'M', 2),
  createCard('deck-12', 'M', 3)
];

const cards = allCards.reduce<Record<CardId, Card>>((acc, card) => {
  acc[card.id] = card;
  return acc;
}, {});

const logs: GameLogEntry[] = [
  {
    id: 'log-01',
    type: 'hint',
    actorId: 'p2',
    actorName: 'Kai',
    targetId: 'p3',
    targetName: 'Mina',
    hintType: 'number',
    suit: null,
    number: 4,
    touched: 1
  },
  {
    id: 'log-02',
    type: 'hint',
    actorId: 'p3',
    actorName: 'Mina',
    targetId: 'you',
    targetName: 'You',
    hintType: 'color',
    suit: 'G',
    number: null,
    touched: 1
  },
  {
    id: 'log-03',
    type: 'play',
    actorId: 'p4',
    actorName: 'Ravi',
    suit: 'G',
    number: 3,
    success: true
  },
  {
    id: 'log-04',
    type: 'discard',
    actorId: 'you',
    actorName: 'You',
    suit: 'W',
    number: 3,
    gainedHint: true
  },
  {
    id: 'log-05',
    type: 'play',
    actorId: 'p2',
    actorName: 'Kai',
    suit: 'B',
    number: 5,
    success: false
  },
  {
    id: 'log-06',
    type: 'draw',
    actorId: 'p3',
    actorName: 'Mina',
    count: 1
  },
  {
    id: 'log-07',
    type: 'hint',
    actorId: 'p3',
    actorName: 'Mina',
    targetId: 'p2',
    targetName: 'Kai',
    hintType: 'number',
    suit: null,
    number: 1,
    touched: 2
  }
];

export const exampleGameState: GameState = {
  players: [
    {
      id: 'you',
      name: 'You',
      cards: ['you-0', 'you-1', 'you-2', 'you-3', 'you-4']
    },
    {
      id: 'p2',
      name: 'Kai',
      cards: ['p2-0', 'p2-1', 'p2-2', 'p2-3', 'p2-4']
    },
    {
      id: 'p3',
      name: 'Mina',
      cards: ['p3-0', 'p3-1', 'p3-2', 'p3-3', 'p3-4']
    },
    {
      id: 'p4',
      name: 'Ravi',
      cards: ['p4-0', 'p4-1', 'p4-2', 'p4-3', 'p4-4']
    }
  ],
  currentTurnPlayerIndex: 2,
  cards,
  drawDeck: [
    'deck-01',
    'deck-02',
    'deck-03',
    'deck-04',
    'deck-05',
    'deck-06',
    'deck-07',
    'deck-08',
    'deck-09',
    'deck-10',
    'deck-11',
    'deck-12'
  ],
  discardPile: ['b4-d1', 'b4-d2', 'y2-d1', 'y3-d1', 'w5-d1', 'g5-d1', 'm5-d1', 'r1-d1', 'w2-d1'],
  fireworks: {
    R: ['r1-p', 'r2-p', 'r3-p', 'r4-p', 'r5-p'],
    Y: [],
    G: ['g1-p', 'g2-p'],
    B: ['b1-p', 'b2-p', 'b3-p'],
    W: ['w1-p'],
    M: ['m1-p', 'm2-p', 'm3-p', 'm4-p']
  },
  hintTokens: 3,
  fuseTokensUsed: 2,
  logs
};
