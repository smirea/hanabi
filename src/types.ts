export const SUITS = ['R', 'Y', 'G', 'B', 'W', 'M'] as const;
export const CARD_NUMBERS = [1, 2, 3, 4, 5] as const;

export type Suit = (typeof SUITS)[number];
export type CardNumber = (typeof CARD_NUMBERS)[number];

export type CardId = string;
export type PlayerId = string;

export type CardHints = {
  color: Suit | null;
  number: CardNumber | null;
  notColors: Suit[];
  notNumbers: CardNumber[];
  recentlyHinted?: boolean;
};

export type Card = {
  id: CardId;
  suit: Suit;
  number: CardNumber;
  hints: CardHints;
};

export type Player = {
  id: PlayerId;
  name: string;
  cards: CardId[];
};

export type Fireworks = Record<Suit, CardId[]>;

export type HintLog = {
  id: string;
  type: 'hint';
  actorId: PlayerId;
  actorName: string;
  targetId: PlayerId;
  targetName: string;
  hintType: 'color' | 'number';
  suit: Suit | null;
  number: CardNumber | null;
  touched: number;
};

export type PlayLog = {
  id: string;
  type: 'play';
  actorId: PlayerId;
  actorName: string;
  suit: Suit;
  number: CardNumber;
  success: boolean;
};

export type DiscardLog = {
  id: string;
  type: 'discard';
  actorId: PlayerId;
  actorName: string;
  suit: Suit;
  number: CardNumber;
  gainedHint: boolean;
};

export type DrawLog = {
  id: string;
  type: 'draw';
  actorId: PlayerId;
  actorName: string;
  count: number;
};

export type GameLogEntry = HintLog | PlayLog | DiscardLog | DrawLog;

export type GameState = {
  players: Player[];
  currentTurnPlayerIndex: number;
  cards: Record<CardId, Card>;
  drawDeck: CardId[];
  discardPile: CardId[];
  fireworks: Fireworks;
  hintTokens: number;
  fuseTokensUsed: number;
  logs: GameLogEntry[];
};
