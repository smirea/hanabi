import { useEffect } from 'react';
import { BASE_SUITS, CARD_NUMBERS, HanabiGame, type CardId, type CardNumber, type GameLogEntry, type HanabiState, type Suit } from './game';

export const DEBUG_SCREEN_EVENT = 'hanabi:debug-screen';

export type DebugScreenName = 'win' | 'lose' | 'game';

export type DebugScreenEventDetail = {
  screen: DebugScreenName;
  state: HanabiState;
};

declare global {
  interface Window {
    DEBUG?: {
      screen?: {
        win?: () => void;
        lose?: () => void;
        game?: () => void;
      };
    };
  }
}

type DebugUiEmpty = HanabiState['ui'];

const EMPTY_UI: DebugUiEmpty = {
  pendingAction: null,
  selectedCardId: null,
  selectedTargetPlayerId: null,
  selectedHintSuit: null,
  selectedHintNumber: null,
  highlightedCardIds: []
};

const MOCK_PLAYERS = {
  ids: ['p1', 'p2', 'p3'],
  names: ['Ari', 'Blair', 'Casey']
};

function removeFromArray(values: string[], value: string): void {
  const index = values.indexOf(value);
  if (index === -1) {
    return;
  }

  values.splice(index, 1);
}

function removeCardFromZones(state: HanabiState, cardId: CardId): void {
  removeFromArray(state.drawDeck, cardId);
  removeFromArray(state.discardPile, cardId);
  for (const player of state.players) {
    removeFromArray(player.cards, cardId);
  }
  for (const suit of (Object.keys(state.fireworks) as Suit[])) {
    removeFromArray(state.fireworks[suit], cardId);
  }
}

function pickCardId(state: HanabiState, suit: Suit, number: CardNumber, used: Set<CardId>): CardId {
  for (const [cardId, card] of Object.entries(state.cards)) {
    if (used.has(cardId)) {
      continue;
    }
    if (card.suit !== suit || card.number !== number) {
      continue;
    }
    used.add(cardId);
    return cardId;
  }

  throw new Error(`Unable to locate card for ${suit}${number}`);
}

function fillFireworks(state: HanabiState, heights: Partial<Record<Suit, number>>): void {
  const used = new Set<CardId>();

  for (const suit of Object.keys(state.fireworks) as Suit[]) {
    state.fireworks[suit] = [];
  }

  for (const suit of state.settings.activeSuits) {
    const height = heights[suit] ?? 0;
    for (const number of CARD_NUMBERS) {
      if (number > height) {
        break;
      }
      const cardId = pickCardId(state, suit, number, used);
      removeCardFromZones(state, cardId);
      state.fireworks[suit].push(cardId);
    }
  }
}

function moveCardsToDiscard(state: HanabiState, count: number): void {
  const existing = new Set<CardId>(state.discardPile);
  const candidates = Object.keys(state.cards).filter((cardId) => {
    if (existing.has(cardId)) return false;
    if (state.drawDeck.includes(cardId)) return true;
    return state.players.some((player) => player.cards.includes(cardId));
  });

  let moved = 0;
  for (const cardId of candidates) {
    if (moved >= count) break;
    removeCardFromZones(state, cardId);
    state.discardPile.push(cardId);
    moved += 1;
  }
}

function createBaseState(): HanabiState {
  return new HanabiGame({
    playerIds: [...MOCK_PLAYERS.ids],
    playerNames: [...MOCK_PLAYERS.names],
    shuffleSeed: 17
  }).getSnapshot();
}

function buildMockLogs({
  status,
  score,
  cardSamplesBySuitNumber
}: {
  status: Extract<HanabiState['status'], 'won' | 'lost' | 'finished'>;
  score: number;
  cardSamplesBySuitNumber: Partial<Record<string, CardId>>;
}): GameLogEntry[] {
  const [p1, p2, p3] = MOCK_PLAYERS.ids;
  const [n1, n2, n3] = MOCK_PLAYERS.names;

  const touchedTwo: CardId[] = (() => {
    const one = cardSamplesBySuitNumber.R1 ?? 'c001';
    const two = cardSamplesBySuitNumber.Y1 ?? 'c002';
    return [one, two];
  })();

  return [
    {
      id: 'log-0001',
      turn: 1,
      type: 'hint',
      actorId: p1,
      actorName: n1,
      targetId: p2,
      targetName: n2,
      hintType: 'number',
      suit: null,
      number: 1,
      touchedCardIds: [...touchedTwo]
    },
    {
      id: 'log-0002',
      turn: 2,
      type: 'hint',
      actorId: p2,
      actorName: n2,
      targetId: p3,
      targetName: n3,
      hintType: 'color',
      suit: 'R',
      number: null,
      touchedCardIds: [cardSamplesBySuitNumber.R2 ?? touchedTwo[0]]
    },
    {
      id: 'log-0003',
      turn: 3,
      type: 'discard',
      actorId: p3,
      actorName: n3,
      cardId: cardSamplesBySuitNumber.G4 ?? touchedTwo[1],
      suit: 'G',
      number: 4,
      gainedHint: true
    },
    {
      id: 'log-0004',
      turn: 4,
      type: 'play',
      actorId: p1,
      actorName: n1,
      cardId: cardSamplesBySuitNumber.B1 ?? touchedTwo[0],
      suit: 'B',
      number: 1,
      success: true,
      gainedHint: false,
      fuseTokensUsed: status === 'lost' ? 3 : 1
    },
    {
      id: 'log-0005',
      turn: 5,
      type: 'discard',
      actorId: p2,
      actorName: n2,
      cardId: cardSamplesBySuitNumber.W2 ?? touchedTwo[1],
      suit: 'W',
      number: 2,
      gainedHint: true
    },
    {
      id: 'log-0006',
      turn: 6,
      type: 'status',
      status,
      reason: status === 'won' ? 'all_fireworks_completed' : status === 'lost' ? 'fuse_limit_reached' : 'final_round_complete',
      score
    }
  ];
}

function createWinState(): HanabiState {
  const state = createBaseState();
  const heights: Partial<Record<Suit, number>> = {};
  for (const suit of state.settings.activeSuits) {
    heights[suit] = CARD_NUMBERS.length;
  }

  fillFireworks(state, heights);
  moveCardsToDiscard(state, 8);

  state.status = 'won';
  state.lastRound = null;
  state.ui = { ...EMPTY_UI };
  state.hintTokens = Math.max(0, Math.min(state.settings.maxHintTokens, 4));
  state.fuseTokensUsed = 1;
  state.currentTurnPlayerIndex = 0;

  const score = HanabiGame.fromState(state).getScore();
  const samples: Partial<Record<string, CardId>> = {};
  for (const suit of BASE_SUITS) {
    for (const number of CARD_NUMBERS) {
      const found = Object.entries(state.cards).find(([, card]) => card.suit === suit && card.number === number)?.[0];
      if (found) {
        samples[`${suit}${number}`] = found;
      }
    }
  }

  state.logs = buildMockLogs({ status: 'won', score, cardSamplesBySuitNumber: samples });
  state.nextLogId = state.logs.length + 1;
  state.turn = 7;

  return HanabiGame.fromState(state).getSnapshot();
}

function createLoseState(): HanabiState {
  const state = createBaseState();
  fillFireworks(state, { R: 3, Y: 2, G: 4, B: 1, W: 0 });
  moveCardsToDiscard(state, 14);

  state.status = 'lost';
  state.lastRound = null;
  state.ui = { ...EMPTY_UI };
  state.hintTokens = 0;
  state.fuseTokensUsed = state.settings.maxFuseTokens;
  state.currentTurnPlayerIndex = 0;

  const score = HanabiGame.fromState(state).getScore();
  const samples: Partial<Record<string, CardId>> = {};
  for (const suit of BASE_SUITS) {
    for (const number of CARD_NUMBERS) {
      const found = Object.entries(state.cards).find(([, card]) => card.suit === suit && card.number === number)?.[0];
      if (found) {
        samples[`${suit}${number}`] = found;
      }
    }
  }

  state.logs = buildMockLogs({ status: 'lost', score, cardSamplesBySuitNumber: samples });
  state.nextLogId = state.logs.length + 1;
  state.turn = 7;

  return HanabiGame.fromState(state).getSnapshot();
}

function createGameState(): HanabiState {
  const state = createBaseState();
  state.ui = { ...EMPTY_UI };
  return HanabiGame.fromState(state).getSnapshot();
}

const stateCache: Partial<Record<DebugScreenName, HanabiState>> = {};

function getMockState(screen: DebugScreenName): HanabiState {
  const cached = stateCache[screen];
  if (cached) {
    return cached;
  }

  const next = screen === 'win' ? createWinState() : screen === 'lose' ? createLoseState() : createGameState();
  stateCache[screen] = next;
  return next;
}

function dispatchDebugScreen(screen: DebugScreenName): void {
  if (typeof window === 'undefined') {
    return;
  }

  const state = getMockState(screen);
  window.dispatchEvent(new CustomEvent<DebugScreenEventDetail>(DEBUG_SCREEN_EVENT, {
    detail: { screen, state }
  }));
}

export function installDebugNamespace(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window;
  root.DEBUG ??= {};
  root.DEBUG.screen ??= {};
  root.DEBUG.screen.win = () => dispatchDebugScreen('win');
  root.DEBUG.screen.lose = () => dispatchDebugScreen('lose');
  root.DEBUG.screen.game = () => dispatchDebugScreen('game');
}

export function useDebugScreensController({
  enabled = true,
  setIsDebugMode,
  debugGame,
  setDebugGameState,
  resetUi
}: {
  enabled?: boolean;
  setIsDebugMode: (next: boolean) => void;
  debugGame: HanabiGame;
  setDebugGameState: (next: HanabiState) => void;
  resetUi?: () => void;
}): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<DebugScreenEventDetail>).detail;
      if (!detail?.state) {
        return;
      }

      setIsDebugMode(true);
      resetUi?.();
      debugGame.replaceState(detail.state);
      setDebugGameState(debugGame.getSnapshot());
    };

    window.addEventListener(DEBUG_SCREEN_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(DEBUG_SCREEN_EVENT, handler as EventListener);
    };
  }, [debugGame, enabled, resetUi, setDebugGameState, setIsDebugMode]);
}
