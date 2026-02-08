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

export type GameState = {
  players: Player[];
  currentTurnPlayerIndex: number;
  cards: Record<CardId, Card>;
  drawDeck: CardId[];
  discardPile: CardId[];
  fireworks: Fireworks;
  hintTokens: number;
  fuseTokensUsed: number;
};
