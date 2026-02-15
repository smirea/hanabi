export const SUITS = ['R', 'Y', 'G', 'B', 'W', 'M'] as const;
const ALL_SUITS = SUITS;
export const BASE_SUITS = ['R', 'Y', 'G', 'B', 'W'] as const;
export const CARD_NUMBERS = [1, 2, 3, 4, 5] as const;

export type Suit = (typeof ALL_SUITS)[number];
export type CardNumber = (typeof CARD_NUMBERS)[number];
export type CardId = string;
export type PlayerId = string;

export type PendingAction = 'play' | 'discard' | 'hint-color' | 'hint-number' | null;
export type GameStatus = 'active' | 'last_round' | 'won' | 'lost' | 'finished';
type TerminalGameStatus = Extract<GameStatus, 'won' | 'lost' | 'finished'>;
type EndReason =
  | 'all_fireworks_completed'
  | 'fuse_limit_reached'
  | 'final_round_complete'
  | 'indispensable_card_discarded';

export type CardHints = {
  color: Suit | null;
  number: CardNumber | null;
  notColors: Suit[];
  notNumbers: CardNumber[];
  recentlyHinted: boolean;
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

type HintLog = {
  id: string;
  turn: number;
  type: 'hint';
  actorId: PlayerId;
  actorName: string;
  targetId: PlayerId;
  targetName: string;
  hintType: 'color' | 'number';
  suit: Suit | null;
  number: CardNumber | null;
  touchedCardIds: CardId[];
};

type PlayLog = {
  id: string;
  turn: number;
  type: 'play';
  actorId: PlayerId;
  actorName: string;
  cardId: CardId;
  suit: Suit;
  number: CardNumber;
  success: boolean;
  gainedHint: boolean;
  fuseTokensUsed: number;
};

type DiscardLog = {
  id: string;
  turn: number;
  type: 'discard';
  actorId: PlayerId;
  actorName: string;
  cardId: CardId;
  suit: Suit;
  number: CardNumber;
  gainedHint: boolean;
};

type DrawLog = {
  id: string;
  turn: number;
  type: 'draw';
  actorId: PlayerId;
  actorName: string;
  cardId: CardId;
  remainingDeck: number;
};

type StatusLog = {
  id: string;
  turn: number;
  type: 'status';
  status: TerminalGameStatus;
  reason: EndReason;
  score: number;
};

export type GameLogEntry = HintLog | PlayLog | DiscardLog | DrawLog | StatusLog;

export type GameUiState = {
  pendingAction: PendingAction;
  selectedCardId: CardId | null;
  selectedTargetPlayerId: PlayerId | null;
  selectedHintSuit: Suit | null;
  selectedHintNumber: CardNumber | null;
  highlightedCardIds: CardId[];
};

export type GameSettings = {
  includeMulticolor: boolean;
  multicolorShortDeck: boolean;
  multicolorWildHints: boolean;
  endlessMode: boolean;
  activeSuits: Suit[];
  maxHintTokens: number;
  maxFuseTokens: number;
  handSize: number;
};

type LastRoundState = {
  turnsRemaining: number;
};

export type HanabiState = {
  players: Player[];
  currentTurnPlayerIndex: number;
  cards: Record<CardId, Card>;
  drawDeck: CardId[];
  discardPile: CardId[];
  fireworks: Record<Suit, CardId[]>;
  hintTokens: number;
  fuseTokensUsed: number;
  status: GameStatus;
  lastRound: LastRoundState | null;
  logs: GameLogEntry[];
  ui: GameUiState;
  turn: number;
  nextLogId: number;
  settings: GameSettings;
};

type CardSeed = {
  suit: Suit;
  number: CardNumber;
};

type NewGameInput = {
  playerNames?: string[];
  playerIds?: string[];
  includeMulticolor?: boolean;
  multicolorShortDeck?: boolean;
  multicolorWildHints?: boolean;
  endlessMode?: boolean;
  maxHintTokens?: number;
  maxFuseTokens?: number;
  startingPlayerIndex?: number;
  deck?: CardSeed[];
  shuffleSeed?: number;
};

type RestoreGameInput = {
  state: HanabiState;
};

type GameConstructorInput = NewGameInput | RestoreGameInput;

const CARD_COPIES: Record<CardNumber, number> = {
  1: 3,
  2: 2,
  3: 2,
  4: 2,
  5: 1
};

export type PerspectiveCard = {
  id: CardId;
  suit: Suit | null;
  number: CardNumber | null;
  hints: CardHints;
  isHiddenFromViewer: boolean;
};

export type PerspectivePlayer = {
  id: PlayerId;
  name: string;
  cards: PerspectiveCard[];
  isViewer: boolean;
  isCurrentTurn: boolean;
};

export type PerspectiveCountsByNumber = Record<CardNumber, number>;
export type PerspectiveCountsBySuit = Record<Suit, PerspectiveCountsByNumber>;

export type HanabiPerspectiveState = {
  viewerId: PlayerId;
  currentTurnPlayerId: PlayerId;
  players: PerspectivePlayer[];
  hintTokens: number;
  maxHintTokens: number;
  fuseTokensUsed: number;
  maxFuseTokens: number;
  drawDeckCount: number;
  status: GameStatus;
  turn: number;
  score: number;
  activeSuits: Suit[];
  logs: GameLogEntry[];
  ui: GameUiState;
  fireworksHeights: Record<Suit, number>;
  knownUnavailableCounts: PerspectiveCountsBySuit;
  knownRemainingCounts: PerspectiveCountsBySuit;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isSuit(value: string): value is Suit {
  return ALL_SUITS.includes(value as Suit);
}

function isCardNumber(value: number): value is CardNumber {
  return CARD_NUMBERS.includes(value as CardNumber);
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function createEmptyHints(): CardHints {
  return {
    color: null,
    number: null,
    notColors: [],
    notNumbers: [],
    recentlyHinted: false
  };
}

function createEmptyUiState(): GameUiState {
  return {
    pendingAction: null,
    selectedCardId: null,
    selectedTargetPlayerId: null,
    selectedHintSuit: null,
    selectedHintNumber: null,
    highlightedCardIds: []
  };
}

function createEmptyFireworks(): Record<Suit, CardId[]> {
  return {
    R: [],
    Y: [],
    G: [],
    B: [],
    W: [],
    M: []
  };
}

function createEmptyCountsBySuit(): PerspectiveCountsBySuit {
  return {
    R: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    Y: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    G: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    B: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    W: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    M: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };
}

function addUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function isRestoreInput(input: GameConstructorInput | undefined): input is RestoreGameInput {
  return typeof input === 'object' && input !== null && 'state' in input;
}

function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export class HanabiGame {
  public state: HanabiState;

  public constructor(input?: GameConstructorInput) {
    if (isRestoreInput(input)) {
      this.state = HanabiGame.normalizeRestoredState(input.state);
      HanabiGame.validateState(this.state);
      return;
    }

    this.state = HanabiGame.createInitialState(input);
    HanabiGame.validateState(this.state);
  }

  public static fromState(state: HanabiState): HanabiGame {
    return new HanabiGame({ state });
  }

  public getSnapshot(): HanabiState {
    return deepClone(this.state);
  }

  public replaceState(state: HanabiState): void {
    const nextState = deepClone(state);
    HanabiGame.validateState(nextState);
    this.state = nextState;
  }

  public isGameOver(): boolean {
    return HanabiGame.isTerminalStatus(this.state.status);
  }

  public getScore(): number {
    return this.state.settings.activeSuits.reduce((sum, suit) => sum + this.state.fireworks[suit].length, 0);
  }

  public getPerspectiveState(viewerId: PlayerId): HanabiPerspectiveState {
    const viewer = this.state.players.find((player) => player.id === viewerId);
    if (!viewer) {
      throw new Error(`Unknown perspective player: ${viewerId}`);
    }

    const currentTurnPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    const knownUnavailableCounts = createEmptyCountsBySuit();

    for (const cardId of this.state.discardPile) {
      const card = this.getCardOrThrow(cardId);
      knownUnavailableCounts[card.suit][card.number] += 1;
    }

    for (const suit of ALL_SUITS) {
      for (const cardId of this.state.fireworks[suit]) {
        const card = this.getCardOrThrow(cardId);
        knownUnavailableCounts[card.suit][card.number] += 1;
      }
    }

    for (const player of this.state.players) {
      if (player.id === viewer.id) {
        continue;
      }

      for (const cardId of player.cards) {
        const card = this.getCardOrThrow(cardId);
        knownUnavailableCounts[card.suit][card.number] += 1;
      }
    }

    const knownRemainingCounts = createEmptyCountsBySuit();
    for (const suit of ALL_SUITS) {
      for (const number of CARD_NUMBERS) {
        const totalCopies = this.getCopiesPerCard(suit, number);
        knownRemainingCounts[suit][number] = Math.max(0, totalCopies - knownUnavailableCounts[suit][number]);
      }
    }

    const fireworksHeights = ALL_SUITS.reduce((acc, suit) => {
      acc[suit] = this.state.fireworks[suit].length;
      return acc;
    }, {} as Record<Suit, number>);

    return {
      viewerId,
      currentTurnPlayerId: currentTurnPlayer.id,
      players: this.state.players.map((player) => ({
        id: player.id,
        name: player.name,
        isViewer: player.id === viewerId,
        isCurrentTurn: player.id === currentTurnPlayer.id,
        cards: player.cards.map((cardId) => {
          const card = this.getCardOrThrow(cardId);
          const isHiddenFromViewer = player.id === viewerId;

          return {
            id: card.id,
            suit: isHiddenFromViewer ? null : card.suit,
            number: isHiddenFromViewer ? null : card.number,
            hints: deepClone(card.hints),
            isHiddenFromViewer
          };
        })
      })),
      hintTokens: this.state.hintTokens,
      maxHintTokens: this.state.settings.maxHintTokens,
      fuseTokensUsed: this.state.fuseTokensUsed,
      maxFuseTokens: this.state.settings.maxFuseTokens,
      drawDeckCount: this.state.drawDeck.length,
      status: this.state.status,
      turn: this.state.turn,
      score: this.getScore(),
      activeSuits: [...this.state.settings.activeSuits],
      logs: deepClone(this.state.logs),
      ui: deepClone(this.state.ui),
      fireworksHeights,
      knownUnavailableCounts,
      knownRemainingCounts
    };
  }

  public beginPlaySelection(): void {
    this.assertTurnCanBePlayed();
    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    if (currentPlayer.cards.length === 0) {
      throw new Error('Cannot play with no cards in hand');
    }

    this.state.ui = {
      ...createEmptyUiState(),
      pendingAction: 'play'
    };
  }

  public beginDiscardSelection(): void {
    this.assertTurnCanBePlayed();
    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    if (currentPlayer.cards.length === 0) {
      throw new Error('Cannot discard with no cards in hand');
    }

    if (this.state.hintTokens >= this.state.settings.maxHintTokens) {
      throw new Error('Cannot discard while all hint tokens are available');
    }

    this.state.ui = {
      ...createEmptyUiState(),
      pendingAction: 'discard'
    };
  }

  public beginColorHintSelection(): void {
    this.assertTurnCanBePlayed();
    if (this.state.hintTokens <= 0) {
      throw new Error('Cannot give a hint with zero hint tokens');
    }

    this.state.ui = {
      ...createEmptyUiState(),
      pendingAction: 'hint-color'
    };
  }

  public beginNumberHintSelection(): void {
    this.assertTurnCanBePlayed();
    if (this.state.hintTokens <= 0) {
      throw new Error('Cannot give a hint with zero hint tokens');
    }

    this.state.ui = {
      ...createEmptyUiState(),
      pendingAction: 'hint-number'
    };
  }

  public cancelSelection(): void {
    this.state.ui = createEmptyUiState();
  }

  public selectCard(cardId: CardId): void {
    this.assertTurnCanBePlayed();
    const pendingAction = this.state.ui.pendingAction;
    if (pendingAction !== 'play' && pendingAction !== 'discard') {
      throw new Error('Card selection is only available for play or discard actions');
    }

    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    if (!currentPlayer.cards.includes(cardId)) {
      throw new Error('Selected card is not in the current player hand');
    }

    this.state.ui.selectedCardId = cardId;
    this.state.ui.highlightedCardIds = [cardId];
  }

  public selectHintTarget(playerId: PlayerId): void {
    this.assertTurnCanBePlayed();
    const pendingAction = this.state.ui.pendingAction;
    if (pendingAction !== 'hint-color' && pendingAction !== 'hint-number') {
      throw new Error('Hint target selection is only available for hint actions');
    }

    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    if (currentPlayer.id === playerId) {
      throw new Error('Cannot target yourself with a hint');
    }

    const playerExists = this.state.players.some((player) => player.id === playerId);
    if (!playerExists) {
      throw new Error(`Unknown player: ${playerId}`);
    }

    this.state.ui.selectedTargetPlayerId = playerId;
    this.recomputeHintHighlights();
  }

  public selectHintColor(suit: Suit): void {
    this.assertTurnCanBePlayed();
    if (this.state.ui.pendingAction !== 'hint-color') {
      throw new Error('Color selection is only available for color hints');
    }

    if (!this.state.settings.activeSuits.includes(suit)) {
      throw new Error(`Color ${suit} is not active in this game`);
    }

    if (this.state.settings.multicolorWildHints && suit === 'M') {
      throw new Error('Cannot call multicolor when multicolorWildHints=true');
    }

    this.state.ui.selectedHintSuit = suit;
    this.recomputeHintHighlights();
  }

  public selectHintNumber(number: CardNumber): void {
    this.assertTurnCanBePlayed();
    if (this.state.ui.pendingAction !== 'hint-number') {
      throw new Error('Number selection is only available for number hints');
    }

    this.state.ui.selectedHintNumber = number;
    this.recomputeHintHighlights();
  }

  public confirmSelection(): void {
    this.assertTurnCanBePlayed();
    const pendingAction = this.state.ui.pendingAction;
    if (pendingAction === null) {
      throw new Error('No pending action to confirm');
    }

    if (pendingAction === 'play') {
      if (!this.state.ui.selectedCardId) {
        throw new Error('Select a card before confirming play');
      }

      this.playCard(this.state.ui.selectedCardId);
      return;
    }

    if (pendingAction === 'discard') {
      if (!this.state.ui.selectedCardId) {
        throw new Error('Select a card before confirming discard');
      }

      this.discardCard(this.state.ui.selectedCardId);
      return;
    }

    if (pendingAction === 'hint-color') {
      if (!this.state.ui.selectedTargetPlayerId || !this.state.ui.selectedHintSuit) {
        throw new Error('Select a target and a color before confirming hint');
      }

      this.giveColorHint(this.state.ui.selectedTargetPlayerId, this.state.ui.selectedHintSuit);
      return;
    }

    if (!this.state.ui.selectedTargetPlayerId || !this.state.ui.selectedHintNumber) {
      throw new Error('Select a target and a number before confirming hint');
    }

    this.giveNumberHint(this.state.ui.selectedTargetPlayerId, this.state.ui.selectedHintNumber);
  }

  public playCard(cardId: CardId): void {
    this.assertTurnCanBePlayed();

    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    const cardIndex = currentPlayer.cards.indexOf(cardId);
    if (cardIndex === -1) {
      throw new Error('Can only play a card from the current player hand');
    }

    const card = this.getCardOrThrow(cardId);
    this.clearRecentHints();
    currentPlayer.cards.splice(cardIndex, 1);

    const expectedNumber = this.state.fireworks[card.suit].length + 1;
    const success = card.number === expectedNumber;
    let gainedHint = false;

    if (success) {
      this.state.fireworks[card.suit].push(cardId);
      if (card.number === 5 && this.state.hintTokens < this.state.settings.maxHintTokens) {
        this.state.hintTokens += 1;
        gainedHint = true;
      }
    } else {
      this.state.discardPile.push(cardId);
      this.state.fuseTokensUsed += 1;
    }

    this.appendPlayLog(currentPlayer, card, success, gainedHint);

    if (!success && this.state.fuseTokensUsed >= this.state.settings.maxFuseTokens) {
      this.transitionToTerminalState('lost', 'fuse_limit_reached');
      this.finalizeAction();
      return;
    }

    if (!success && this.state.settings.endlessMode && !this.isPerfectionStillPossible()) {
      this.transitionToTerminalState('lost', 'indispensable_card_discarded');
      this.finalizeAction();
      return;
    }

    if (success && this.areAllFireworksComplete()) {
      this.transitionToTerminalState('won', 'all_fireworks_completed');
      this.finalizeAction();
      return;
    }

    this.drawCardForPlayer(this.state.currentTurnPlayerIndex);
    this.finalizeAction();
  }

  public discardCard(cardId: CardId): void {
    this.assertTurnCanBePlayed();

    if (this.state.hintTokens >= this.state.settings.maxHintTokens) {
      throw new Error('Cannot discard while all hint tokens are available');
    }

    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    const cardIndex = currentPlayer.cards.indexOf(cardId);
    if (cardIndex === -1) {
      throw new Error('Can only discard a card from the current player hand');
    }

    const card = this.getCardOrThrow(cardId);
    this.clearRecentHints();
    currentPlayer.cards.splice(cardIndex, 1);
    this.state.discardPile.push(cardId);
    this.state.hintTokens += 1;

    this.appendDiscardLog(currentPlayer, card, true);
    if (this.state.settings.endlessMode && !this.isPerfectionStillPossible()) {
      this.transitionToTerminalState('lost', 'indispensable_card_discarded');
      this.finalizeAction();
      return;
    }

    this.drawCardForPlayer(this.state.currentTurnPlayerIndex);
    this.finalizeAction();
  }

  public giveColorHint(targetPlayerId: PlayerId, suit: Suit): void {
    this.assertTurnCanBePlayed();

    if (!this.state.settings.activeSuits.includes(suit)) {
      throw new Error(`Color ${suit} is not active in this game`);
    }

    if (this.state.settings.multicolorWildHints && suit === 'M') {
      throw new Error('Cannot call multicolor when multicolorWildHints=true');
    }

    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    const targetPlayer = this.getHintTargetPlayerOrThrow(targetPlayerId);
    if (this.state.hintTokens <= 0) {
      throw new Error('Cannot give a hint with zero hint tokens');
    }

    const touchedCardIds = targetPlayer.cards.filter((cardId) => {
      const card = this.getCardOrThrow(cardId);
      return this.doesCardMatchColorHint(card.suit, suit);
    });
    if (touchedCardIds.length === 0) {
      throw new Error(`Hint must touch at least one card (${suit})`);
    }

    const touchedSet = new Set(touchedCardIds);

    const redundant = (() => {
      if (this.state.settings.multicolorWildHints && suit !== 'M') {
        const allowedSuits: Suit[] = [suit, 'M'];
        for (const cardId of targetPlayer.cards) {
          const card = this.getCardOrThrow(cardId);
          const touched = touchedSet.has(cardId);
          const currentPossibleSuits = this.getPossibleSuits(card);
          const nextPossibleSuits = touched
            ? currentPossibleSuits.filter((candidate) => allowedSuits.includes(candidate))
            : currentPossibleSuits.filter((candidate) => !allowedSuits.includes(candidate));

          if (nextPossibleSuits.length === 0) {
            return false;
          }

          if (currentPossibleSuits.length !== nextPossibleSuits.length) {
            return false;
          }

          for (let index = 0; index < currentPossibleSuits.length; index += 1) {
            if (currentPossibleSuits[index] !== nextPossibleSuits[index]) {
              return false;
            }
          }
        }

        return true;
      }

      for (const cardId of targetPlayer.cards) {
        const card = this.getCardOrThrow(cardId);
        if (touchedSet.has(cardId)) {
          if (card.hints.color !== suit) {
            return false;
          }

          if (card.hints.notColors.includes(suit)) {
            return false;
          }

          continue;
        }

        if (!card.hints.notColors.includes(suit)) {
          return false;
        }
      }

      return true;
    })();

    if (redundant) {
      throw new Error('Hint would provide no new information');
    }

    this.clearRecentHints();
    this.state.hintTokens -= 1;

    if (this.state.settings.multicolorWildHints) {
      this.applyWildColorHint(targetPlayer, suit, touchedSet);
    } else {
      for (const cardId of targetPlayer.cards) {
        const card = this.getCardOrThrow(cardId);
        if (touchedSet.has(cardId)) {
          card.hints.color = suit;
          card.hints.notColors = card.hints.notColors.filter((value) => value !== suit);
          card.hints.recentlyHinted = true;
        } else {
          addUnique(card.hints.notColors, suit);
        }
      }
    }

    this.appendHintLog(currentPlayer, targetPlayer, 'color', touchedCardIds, suit, null);
    this.finalizeAction();
  }

  public giveNumberHint(targetPlayerId: PlayerId, number: CardNumber): void {
    this.assertTurnCanBePlayed();

    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    const targetPlayer = this.getHintTargetPlayerOrThrow(targetPlayerId);
    if (this.state.hintTokens <= 0) {
      throw new Error('Cannot give a hint with zero hint tokens');
    }

    const touchedCardIds = targetPlayer.cards.filter((cardId) => this.state.cards[cardId].number === number);
    if (touchedCardIds.length === 0) {
      throw new Error(`Hint must touch at least one card (${number})`);
    }

    const touchedSet = new Set(touchedCardIds);

    const redundant = targetPlayer.cards.every((cardId) => {
      const card = this.getCardOrThrow(cardId);
      if (touchedSet.has(cardId)) {
        return card.hints.number === number && !card.hints.notNumbers.includes(number);
      }

      return card.hints.notNumbers.includes(number);
    });

    if (redundant) {
      throw new Error('Hint would provide no new information');
    }

    this.clearRecentHints();
    this.state.hintTokens -= 1;

    for (const cardId of targetPlayer.cards) {
      const card = this.getCardOrThrow(cardId);
      if (touchedSet.has(cardId)) {
        card.hints.number = number;
        card.hints.notNumbers = card.hints.notNumbers.filter((value) => value !== number);
        card.hints.recentlyHinted = true;
      } else {
        addUnique(card.hints.notNumbers, number);
      }
    }

    this.appendHintLog(currentPlayer, targetPlayer, 'number', touchedCardIds, null, number);
    this.finalizeAction();
  }

  private static createInitialState(input: NewGameInput | undefined): HanabiState {
    const playerNames = input?.playerNames ?? ['Player 1', 'Player 2'];
    assert(Array.isArray(playerNames), 'playerNames must be an array');
    assert(playerNames.length >= 2 && playerNames.length <= 5, 'Hanabi supports 2 to 5 players');

    const playerIds = input?.playerIds ?? playerNames.map((_, index) => `p${index + 1}`);
    assert(playerIds.length === playerNames.length, 'playerIds length must match playerNames length');

    const uniquePlayerIds = new Set(playerIds);
    assert(uniquePlayerIds.size === playerIds.length, 'playerIds must be unique');

    for (const name of playerNames) {
      assert(typeof name === 'string' && name.trim().length > 0, 'player names must be non-empty strings');
    }

    const uniquePlayerNames = new Set(playerNames.map((name) => name.trim().replace(/\s+/g, ' ').toLowerCase()));
    assert(uniquePlayerNames.size === playerNames.length, 'playerNames must be unique');

    const includeMulticolor = input?.includeMulticolor ?? false;
    const multicolorShortDeck = input?.multicolorShortDeck ?? false;
    const multicolorWildHints = input?.multicolorWildHints ?? false;
    const endlessMode = input?.endlessMode ?? false;
    if (multicolorShortDeck && !includeMulticolor) {
      throw new Error('multicolorShortDeck requires includeMulticolor=true');
    }

    if (multicolorWildHints && !includeMulticolor) {
      throw new Error('multicolorWildHints requires includeMulticolor=true');
    }

    if (multicolorWildHints && multicolorShortDeck) {
      throw new Error('multicolorWildHints cannot be combined with multicolorShortDeck');
    }

    const maxHintTokens = input?.maxHintTokens ?? 8;
    const maxFuseTokens = input?.maxFuseTokens ?? 3;
    assert(isInteger(maxHintTokens) && maxHintTokens > 0, 'maxHintTokens must be a positive integer');
    assert(isInteger(maxFuseTokens) && maxFuseTokens > 0, 'maxFuseTokens must be a positive integer');

    const handSize = playerNames.length <= 3 ? 5 : 4;
    const activeSuits = includeMulticolor ? [...ALL_SUITS] : [...BASE_SUITS];

    if (input?.shuffleSeed !== undefined) {
      assert(Number.isFinite(input.shuffleSeed), 'shuffleSeed must be a finite number');
    }

    const deckSeed = input?.deck
      ? HanabiGame.cloneAndValidateDeck(input.deck)
      : HanabiGame.buildDeck(includeMulticolor, multicolorShortDeck);
    const shuffledDeck = input?.deck
      ? deckSeed
      : HanabiGame.shuffleDeck(deckSeed, input?.shuffleSeed);

    const cards: Record<CardId, Card> = {};
    const drawDeck: CardId[] = [];
    for (const [index, seed] of shuffledDeck.entries()) {
      const cardId = `c${String(index + 1).padStart(3, '0')}`;
      cards[cardId] = {
        id: cardId,
        suit: seed.suit,
        number: seed.number,
        hints: createEmptyHints()
      };
      drawDeck.push(cardId);
    }

    const players: Player[] = playerNames.map((name, index) => ({
      id: playerIds[index],
      name,
      cards: []
    }));

    const requiredCards = players.length * handSize;
    if (drawDeck.length < requiredCards) {
      throw new Error(`Deck must contain at least ${requiredCards} cards to deal starting hands`);
    }

    for (let round = 0; round < handSize; round += 1) {
      for (const player of players) {
        const nextCardId = drawDeck.shift();
        if (!nextCardId) {
          throw new Error('Not enough cards to deal starting hands');
        }

        player.cards.push(nextCardId);
      }
    }

    const startingPlayerIndex = input?.startingPlayerIndex ?? 0;
    assert(
      isInteger(startingPlayerIndex) && startingPlayerIndex >= 0 && startingPlayerIndex < players.length,
      'startingPlayerIndex is out of range'
    );

    return {
      players,
      currentTurnPlayerIndex: startingPlayerIndex,
      cards,
      drawDeck,
      discardPile: [],
      fireworks: createEmptyFireworks(),
      hintTokens: maxHintTokens,
      fuseTokensUsed: 0,
      status: 'active',
      lastRound: null,
      logs: [],
      ui: createEmptyUiState(),
      turn: 1,
      nextLogId: 1,
      settings: {
        includeMulticolor,
        multicolorShortDeck,
        multicolorWildHints,
        endlessMode,
        activeSuits,
        maxHintTokens,
        maxFuseTokens,
        handSize
      }
    };
  }

  private static cloneAndValidateDeck(deck: CardSeed[]): CardSeed[] {
    assert(Array.isArray(deck), 'deck must be an array');
    assert(deck.length > 0, 'deck must not be empty');

    const clonedDeck = deepClone(deck);
    for (const card of clonedDeck) {
      assert(card && typeof card === 'object', 'deck cards must be objects');
      assert(isSuit(card.suit), `Invalid suit in deck: ${String(card.suit)}`);
      assert(isCardNumber(card.number), `Invalid number in deck: ${String(card.number)}`);
    }

    return clonedDeck;
  }

  private static buildDeck(includeMulticolor: boolean, multicolorShortDeck: boolean): CardSeed[] {
    const suits = includeMulticolor ? ALL_SUITS : BASE_SUITS;
    const deck: CardSeed[] = [];

    for (const suit of suits) {
      for (const number of CARD_NUMBERS) {
        const copies = suit === 'M' && multicolorShortDeck ? 1 : CARD_COPIES[number];
        for (let copy = 0; copy < copies; copy += 1) {
          deck.push({ suit, number });
        }
      }
    }

    return deck;
  }

  private static shuffleDeck(deck: CardSeed[], seed: number | undefined): CardSeed[] {
    const shuffled = [...deck];
    const random = seed === undefined ? Math.random : createSeededRandom(seed);

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
  }

  private assertTurnCanBePlayed(): void {
    if (HanabiGame.isTerminalStatus(this.state.status)) {
      throw new Error(`Game is over (${this.state.status})`);
    }
  }

  private getCopiesPerCard(suit: Suit, number: CardNumber): number {
    if (suit === 'M' && this.state.settings.multicolorShortDeck) {
      return 1;
    }

    return CARD_COPIES[number];
  }

  private static isTerminalStatus(status: GameStatus): status is TerminalGameStatus {
    return status === 'won' || status === 'lost' || status === 'finished';
  }

  private getCardOrThrow(cardId: CardId): Card {
    const card = this.state.cards[cardId];
    if (!card) {
      throw new Error(`Unknown card: ${cardId}`);
    }

    return card;
  }

  private getHintTargetPlayerOrThrow(targetPlayerId: PlayerId): Player {
    const currentPlayer = this.state.players[this.state.currentTurnPlayerIndex];
    if (currentPlayer.id === targetPlayerId) {
      throw new Error('Cannot target yourself with a hint');
    }

    const targetPlayer = this.state.players.find((player) => player.id === targetPlayerId);
    if (!targetPlayer) {
      throw new Error(`Unknown player: ${targetPlayerId}`);
    }

    return targetPlayer;
  }

  private recomputeHintHighlights(): void {
    const pendingAction = this.state.ui.pendingAction;
    if (pendingAction !== 'hint-color' && pendingAction !== 'hint-number') {
      this.state.ui.highlightedCardIds = [];
      return;
    }

    const targetId = this.state.ui.selectedTargetPlayerId;
    if (!targetId) {
      this.state.ui.highlightedCardIds = [];
      return;
    }

    const target = this.state.players.find((player) => player.id === targetId);
    if (!target) {
      throw new Error(`Unknown player: ${targetId}`);
    }

    if (pendingAction === 'hint-color') {
      if (!this.state.ui.selectedHintSuit) {
        this.state.ui.highlightedCardIds = [];
        return;
      }

      const hintSuit = this.state.ui.selectedHintSuit;
      this.state.ui.highlightedCardIds = target.cards.filter((cardId) => {
        const card = this.state.cards[cardId];
        if (!card) {
          throw new Error(`Unknown card in target hand: ${cardId}`);
        }

        return this.doesCardMatchColorHint(card.suit, hintSuit);
      });
      return;
    }

    if (!this.state.ui.selectedHintNumber) {
      this.state.ui.highlightedCardIds = [];
      return;
    }

    this.state.ui.highlightedCardIds = target.cards.filter(
      (cardId) => this.state.cards[cardId].number === this.state.ui.selectedHintNumber
    );
  }

  private clearRecentHints(): void {
    for (const card of Object.values(this.state.cards)) {
      card.hints.recentlyHinted = false;
    }
  }

  private doesCardMatchColorHint(cardSuit: Suit, hintSuit: Suit): boolean {
    if (cardSuit === hintSuit) {
      return true;
    }

    return this.state.settings.multicolorWildHints && cardSuit === 'M' && hintSuit !== 'M';
  }

  private getPossibleSuits(card: Card): Suit[] {
    if (card.hints.color !== null) {
      return [card.hints.color];
    }

    return this.state.settings.activeSuits.filter((suit) => !card.hints.notColors.includes(suit));
  }

  private setPossibleSuits(card: Card, possibleSuits: Suit[]): void {
    const uniquePossibleSuits = [...new Set(possibleSuits)];
    assert(uniquePossibleSuits.length > 0, 'Card cannot have zero possible suits');
    for (const suit of uniquePossibleSuits) {
      assert(this.state.settings.activeSuits.includes(suit), `Invalid possible suit: ${String(suit)}`);
    }

    card.hints.notColors = this.state.settings.activeSuits.filter((suit) => !uniquePossibleSuits.includes(suit));
    card.hints.color = uniquePossibleSuits.length === 1 ? uniquePossibleSuits[0] : null;
  }

  private applyWildColorHint(targetPlayer: Player, suit: Suit, touchedSet: Set<CardId>): void {
    if (!this.state.settings.includeMulticolor) {
      throw new Error('multicolorWildHints requires includeMulticolor=true');
    }

    if (!this.state.settings.activeSuits.includes('M')) {
      throw new Error('multicolorWildHints requires multicolor suit to be active');
    }

    if (suit === 'M') {
      throw new Error('Cannot call multicolor when multicolorWildHints=true');
    }

    const allowedSuits: Suit[] = [suit, 'M'];
    for (const cardId of targetPlayer.cards) {
      const card = this.getCardOrThrow(cardId);
      const touched = touchedSet.has(cardId);
      const currentPossibleSuits = this.getPossibleSuits(card);
      const nextPossibleSuits = touched
        ? currentPossibleSuits.filter((candidate) => allowedSuits.includes(candidate))
        : currentPossibleSuits.filter((candidate) => !allowedSuits.includes(candidate));

      if (nextPossibleSuits.length === 0) {
        throw new Error(`Color hint would make card ${cardId} have no possible suits`);
      }

      this.setPossibleSuits(card, nextPossibleSuits);
      card.hints.recentlyHinted = touched;
    }
  }

  private isPerfectionStillPossible(): boolean {
    const remaining = createEmptyCountsBySuit();

    for (const cardId of this.state.drawDeck) {
      const card = this.state.cards[cardId];
      if (!card) {
        throw new Error(`Unknown card in drawDeck: ${cardId}`);
      }

      remaining[card.suit][card.number] += 1;
    }

    for (const player of this.state.players) {
      for (const cardId of player.cards) {
        const card = this.state.cards[cardId];
        if (!card) {
          throw new Error(`Unknown card in player hand: ${cardId}`);
        }

        remaining[card.suit][card.number] += 1;
      }
    }

    for (const suit of this.state.settings.activeSuits) {
      const height = this.state.fireworks[suit].length;
      for (const number of CARD_NUMBERS) {
        if (number <= height) {
          continue;
        }

        if (remaining[suit][number] <= 0) {
          return false;
        }
      }
    }

    return true;
  }

  private drawCardForPlayer(playerIndex: number): boolean {
    if (this.state.drawDeck.length === 0) {
      return false;
    }

    const drawnCardId = this.state.drawDeck.shift();
    if (!drawnCardId) {
      throw new Error('Draw pile is unexpectedly empty');
    }

    const player = this.state.players[playerIndex];
    player.cards.push(drawnCardId);
    return this.state.drawDeck.length === 0;
  }

  private canPlayerGiveHint(playerIndex: number): boolean {
    if (this.state.hintTokens <= 0) {
      return false;
    }

    for (let index = 0; index < this.state.players.length; index += 1) {
      if (index === playerIndex) {
        continue;
      }

      if (this.state.players[index].cards.length > 0) {
        return true;
      }
    }

    return false;
  }

  private playerHasLegalAction(playerIndex: number): boolean {
    const player = this.state.players[playerIndex];
    if (!player) {
      throw new Error(`Unknown player index: ${playerIndex}`);
    }

    if (player.cards.length > 0) {
      return true;
    }

    return this.canPlayerGiveHint(playerIndex);
  }

  private advanceTurn(): void {
    const playerCount = this.state.players.length;
    const currentIndex = this.state.currentTurnPlayerIndex;

    for (let offset = 1; offset <= playerCount; offset += 1) {
      const candidateIndex = (currentIndex + offset) % playerCount;
      if (this.playerHasLegalAction(candidateIndex)) {
        this.state.currentTurnPlayerIndex = candidateIndex;
        return;
      }
    }

    this.state.currentTurnPlayerIndex = (currentIndex + 1) % playerCount;
  }

  private areAllFireworksComplete(): boolean {
    return this.state.settings.activeSuits.every((suit) => this.state.fireworks[suit].length === CARD_NUMBERS.length);
  }

  private transitionToTerminalState(status: TerminalGameStatus, reason: EndReason): void {
    this.state.status = status;
    this.state.lastRound = null;
    this.appendStatusLog(status, reason);
  }

  private finalizeAction(): void {
    if (!HanabiGame.isTerminalStatus(this.state.status)) {
      this.advanceTurn();
    }

    this.state.turn += 1;
    this.state.ui = createEmptyUiState();
    HanabiGame.validateState(this.state);
  }

  private nextLogId(): string {
    const id = `log-${String(this.state.nextLogId).padStart(4, '0')}`;
    this.state.nextLogId += 1;
    return id;
  }

  private appendHintLog(
    actor: Player,
    target: Player,
    hintType: 'color' | 'number',
    touchedCardIds: CardId[],
    suit: Suit | null,
    number: CardNumber | null
  ): void {
    this.state.logs.push({
      id: this.nextLogId(),
      turn: this.state.turn,
      type: 'hint',
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      hintType,
      suit,
      number,
      touchedCardIds: [...touchedCardIds]
    });
  }

  private appendPlayLog(actor: Player, card: Card, success: boolean, gainedHint: boolean): void {
    this.state.logs.push({
      id: this.nextLogId(),
      turn: this.state.turn,
      type: 'play',
      actorId: actor.id,
      actorName: actor.name,
      cardId: card.id,
      suit: card.suit,
      number: card.number,
      success,
      gainedHint,
      fuseTokensUsed: this.state.fuseTokensUsed
    });
  }

  private appendDiscardLog(actor: Player, card: Card, gainedHint: boolean): void {
    this.state.logs.push({
      id: this.nextLogId(),
      turn: this.state.turn,
      type: 'discard',
      actorId: actor.id,
      actorName: actor.name,
      cardId: card.id,
      suit: card.suit,
      number: card.number,
      gainedHint
    });
  }

  private appendStatusLog(status: TerminalGameStatus, reason: EndReason): void {
    this.state.logs.push({
      id: this.nextLogId(),
      turn: this.state.turn,
      type: 'status',
      status,
      reason,
      score: this.getScore()
    });
  }

  private static normalizeRestoredState(state: HanabiState): HanabiState {
    const cloned = deepClone(state);
    if (!cloned.settings || typeof cloned.settings !== 'object') {
      return cloned;
    }

    if (typeof (cloned.settings as any).multicolorWildHints !== 'boolean') {
      (cloned.settings as any).multicolorWildHints = false;
    }

    if (cloned.status === 'last_round') {
      cloned.status = 'active';
      cloned.lastRound = null;
    }

    return cloned;
  }

  private static validateState(state: HanabiState): void {
    assert(state && typeof state === 'object', 'State must be an object');

    assert(Array.isArray(state.players), 'players must be an array');
    assert(state.players.length >= 2 && state.players.length <= 5, 'State must have 2 to 5 players');
    assert(isInteger(state.currentTurnPlayerIndex), 'currentTurnPlayerIndex must be an integer');
    assert(
      state.currentTurnPlayerIndex >= 0 && state.currentTurnPlayerIndex < state.players.length,
      'currentTurnPlayerIndex is out of range'
    );

    assert(state.settings && typeof state.settings === 'object', 'settings must be defined');
    assert(isInteger(state.settings.maxHintTokens) && state.settings.maxHintTokens > 0, 'Invalid maxHintTokens');
    assert(isInteger(state.settings.maxFuseTokens) && state.settings.maxFuseTokens > 0, 'Invalid maxFuseTokens');
    assert(isInteger(state.settings.handSize) && state.settings.handSize > 0, 'Invalid handSize');
    assert(typeof state.settings.endlessMode === 'boolean', 'endlessMode must be boolean');
    assert(typeof state.settings.multicolorWildHints === 'boolean', 'multicolorWildHints must be boolean');
    assert(Array.isArray(state.settings.activeSuits), 'activeSuits must be an array');
    assert(state.settings.activeSuits.length > 0, 'activeSuits cannot be empty');
    const activeSuitSet = new Set<Suit>();
    for (const suit of state.settings.activeSuits) {
      assert(isSuit(suit), `Invalid active suit: ${String(suit)}`);
      activeSuitSet.add(suit);
    }

    assert(activeSuitSet.size === state.settings.activeSuits.length, 'activeSuits must not contain duplicates');
    if (!state.settings.includeMulticolor) {
      assert(!activeSuitSet.has('M'), 'Multicolor suit cannot be active when includeMulticolor=false');
    } else {
      assert(activeSuitSet.has('M'), 'Multicolor suit must be active when includeMulticolor=true');
    }

    if (state.settings.multicolorShortDeck) {
      assert(state.settings.includeMulticolor, 'multicolorShortDeck requires includeMulticolor=true');
    }

    if (state.settings.multicolorWildHints) {
      assert(state.settings.includeMulticolor, 'multicolorWildHints requires includeMulticolor=true');
      assert(!state.settings.multicolorShortDeck, 'multicolorWildHints cannot be combined with multicolorShortDeck');
    }

    assert(isInteger(state.hintTokens), 'hintTokens must be an integer');
    assert(
      state.hintTokens >= 0 && state.hintTokens <= state.settings.maxHintTokens,
      'hintTokens is out of range'
    );
    assert(isInteger(state.fuseTokensUsed), 'fuseTokensUsed must be an integer');
    assert(
      state.fuseTokensUsed >= 0 && state.fuseTokensUsed <= state.settings.maxFuseTokens,
      'fuseTokensUsed is out of range'
    );

    assert(state.status === 'active'
      || state.status === 'last_round'
      || state.status === 'won'
      || state.status === 'lost'
      || state.status === 'finished', 'Invalid game status');

    if (state.status === 'last_round') {
      assert(state.lastRound !== null, 'lastRound state is required when status is last_round');
      assert(isInteger(state.lastRound.turnsRemaining), 'lastRound.turnsRemaining must be an integer');
      assert(state.lastRound.turnsRemaining > 0, 'lastRound.turnsRemaining must be positive');
    } else {
      assert(state.lastRound === null, 'lastRound must be null unless status is last_round');
    }

    assert(state.cards && typeof state.cards === 'object', 'cards must be an object map');
    const cardIds = Object.keys(state.cards);
    assert(cardIds.length > 0, 'cards map cannot be empty');
    for (const cardId of cardIds) {
      const card = state.cards[cardId];
      assert(card.id === cardId, `Card id mismatch for ${cardId}`);
      assert(isSuit(card.suit), `Invalid suit for card ${cardId}`);
      assert(isCardNumber(card.number), `Invalid number for card ${cardId}`);
      if (!state.settings.includeMulticolor) {
        assert(card.suit !== 'M', 'Found multicolor card while includeMulticolor=false');
      }

      assert(card.hints && typeof card.hints === 'object', `Missing hints for card ${cardId}`);
      assert(card.hints.color === null || isSuit(card.hints.color), `Invalid hint color for card ${cardId}`);
      assert(
        card.hints.number === null || isCardNumber(card.hints.number),
        `Invalid hint number for card ${cardId}`
      );
      assert(Array.isArray(card.hints.notColors), `notColors must be an array for card ${cardId}`);
      assert(Array.isArray(card.hints.notNumbers), `notNumbers must be an array for card ${cardId}`);
      const notColorsSet = new Set<Suit>();
      for (const notColor of card.hints.notColors) {
        assert(isSuit(notColor), `Invalid notColor hint for card ${cardId}`);
        notColorsSet.add(notColor);
      }

      assert(notColorsSet.size === card.hints.notColors.length, `Duplicate notColors for card ${cardId}`);
      const notNumbersSet = new Set<CardNumber>();
      for (const notNumber of card.hints.notNumbers) {
        assert(isCardNumber(notNumber), `Invalid notNumber hint for card ${cardId}`);
        notNumbersSet.add(notNumber);
      }

      assert(notNumbersSet.size === card.hints.notNumbers.length, `Duplicate notNumbers for card ${cardId}`);
      assert(typeof card.hints.recentlyHinted === 'boolean', `recentlyHinted must be boolean for card ${cardId}`);
    }

    assert(Array.isArray(state.drawDeck), 'drawDeck must be an array');
    assert(Array.isArray(state.discardPile), 'discardPile must be an array');

    assert(state.fireworks && typeof state.fireworks === 'object', 'fireworks must be an object map');
    for (const suit of ALL_SUITS) {
      const firework = state.fireworks[suit];
      assert(Array.isArray(firework), `Missing firework array for suit ${suit}`);
      if (!activeSuitSet.has(suit)) {
        assert(firework.length === 0, `Inactive suit ${suit} cannot have cards in fireworks`);
      }

      let expectedNumber = 1;
      for (const cardId of firework) {
        const card = state.cards[cardId];
        assert(card, `Unknown card in fireworks: ${cardId}`);
        assert(card.suit === suit, `Card ${cardId} is in wrong firework pile`);
        assert(card.number === expectedNumber, `Firework ${suit} must be in ascending order starting at 1`);
        expectedNumber += 1;
      }
    }

    const seenCardIds = new Set<CardId>();
    const playerIds = new Set<PlayerId>();
    for (const player of state.players) {
      assert(typeof player.id === 'string' && player.id.length > 0, 'Player id must be a non-empty string');
      assert(!playerIds.has(player.id), `Duplicate player id: ${player.id}`);
      playerIds.add(player.id);
      assert(typeof player.name === 'string' && player.name.trim().length > 0, 'Player name must be non-empty');
      assert(Array.isArray(player.cards), `Player cards must be an array (${player.id})`);
      for (const cardId of player.cards) {
        assert(state.cards[cardId], `Unknown card in hand: ${cardId}`);
        assert(!seenCardIds.has(cardId), `Card appears in multiple zones: ${cardId}`);
        seenCardIds.add(cardId);
      }
    }

    for (const cardId of state.drawDeck) {
      assert(state.cards[cardId], `Unknown card in drawDeck: ${cardId}`);
      assert(!seenCardIds.has(cardId), `Card appears in multiple zones: ${cardId}`);
      seenCardIds.add(cardId);
    }

    for (const cardId of state.discardPile) {
      assert(state.cards[cardId], `Unknown card in discard pile: ${cardId}`);
      assert(!seenCardIds.has(cardId), `Card appears in multiple zones: ${cardId}`);
      seenCardIds.add(cardId);
    }

    for (const suit of ALL_SUITS) {
      for (const cardId of state.fireworks[suit]) {
        assert(state.cards[cardId], `Unknown card in fireworks: ${cardId}`);
        assert(!seenCardIds.has(cardId), `Card appears in multiple zones: ${cardId}`);
        seenCardIds.add(cardId);
      }
    }

    assert(
      seenCardIds.size === cardIds.length,
      'Every card must exist in exactly one zone (hand, deck, discard, or fireworks)'
    );

    assert(isInteger(state.turn) && state.turn >= 1, 'turn must be a positive integer');
    assert(isInteger(state.nextLogId) && state.nextLogId >= 1, 'nextLogId must be a positive integer');
    assert(Array.isArray(state.logs), 'logs must be an array');

    const logIds = new Set<string>();
    for (const log of state.logs) {
      assert(typeof log.id === 'string' && log.id.length > 0, 'Log id must be a non-empty string');
      assert(!logIds.has(log.id), `Duplicate log id: ${log.id}`);
      logIds.add(log.id);
      assert(isInteger(log.turn) && log.turn >= 1, `Invalid log turn for log ${log.id}`);
    }

    assert(state.ui && typeof state.ui === 'object', 'ui must be defined');
    const pendingAction = state.ui.pendingAction;
    assert(
      pendingAction === null
      || pendingAction === 'play'
      || pendingAction === 'discard'
      || pendingAction === 'hint-color'
      || pendingAction === 'hint-number',
      'Invalid pendingAction'
    );
    assert(
      state.ui.selectedCardId === null || typeof state.ui.selectedCardId === 'string',
      'selectedCardId must be a string or null'
    );
    assert(
      state.ui.selectedTargetPlayerId === null || typeof state.ui.selectedTargetPlayerId === 'string',
      'selectedTargetPlayerId must be a string or null'
    );
    assert(
      state.ui.selectedHintSuit === null || isSuit(state.ui.selectedHintSuit),
      'selectedHintSuit must be a suit or null'
    );
    assert(
      state.ui.selectedHintNumber === null || isCardNumber(state.ui.selectedHintNumber),
      'selectedHintNumber must be a number or null'
    );
    assert(Array.isArray(state.ui.highlightedCardIds), 'highlightedCardIds must be an array');
    for (const cardId of state.ui.highlightedCardIds) {
      assert(state.cards[cardId], `Unknown highlighted card: ${cardId}`);
    }

    if (pendingAction === null) {
      assert(state.ui.selectedCardId === null, 'selectedCardId must be null when no action is pending');
      assert(state.ui.selectedTargetPlayerId === null, 'selectedTargetPlayerId must be null when no action is pending');
      assert(state.ui.selectedHintSuit === null, 'selectedHintSuit must be null when no action is pending');
      assert(state.ui.selectedHintNumber === null, 'selectedHintNumber must be null when no action is pending');
      assert(state.ui.highlightedCardIds.length === 0, 'highlightedCardIds must be empty when no action is pending');
    }

    if (pendingAction === 'play' || pendingAction === 'discard') {
      assert(state.ui.selectedTargetPlayerId === null, 'target selection is invalid for play/discard');
      assert(state.ui.selectedHintSuit === null, 'hint suit selection is invalid for play/discard');
      assert(state.ui.selectedHintNumber === null, 'hint number selection is invalid for play/discard');
    }

    if (pendingAction === 'hint-color' || pendingAction === 'hint-number') {
      assert(state.ui.selectedCardId === null, 'card selection is invalid for hint actions');
      if (state.ui.selectedTargetPlayerId !== null) {
        assert(playerIds.has(state.ui.selectedTargetPlayerId), 'selectedTargetPlayerId references unknown player');
      }
    }

    if (HanabiGame.isTerminalStatus(state.status)) {
      assert(pendingAction === null, 'No action can be pending when the game is over');
    }

    const allFireworksComplete = state.settings.activeSuits.every(
      (suit) => state.fireworks[suit].length === CARD_NUMBERS.length
    );
    if (state.status === 'won') {
      assert(allFireworksComplete, 'Won state requires all active fireworks to be complete');
    }
  }
}
