import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ComponentType, type ReactNode } from 'react';
import { animate } from 'motion';
import {
  CardsThree,
  Drop,
  Fire,
  GearSix,
  Heart,
  Leaf,
  LightbulbFilament,
  Rainbow,
  Snowflake,
  Sun,
  type IconProps
} from '@phosphor-icons/react';
import {
  BASE_SUITS,
  CARD_NUMBERS,
  HanabiGame,
  type CardId,
  type CardNumber,
  type GameLogEntry,
  type HanabiState,
  type HanabiPerspectiveState,
  type PerspectiveCard,
  type PlayerId,
  type Suit
} from './game';
import {
  getDebugNetworkPlayerIdFromHash,
  getDebugNetworkPlayersFromRoom,
  syncDebugNetworkRoomPlayers,
  toDebugNetworkPlayerHash,
  useDebugNetworkSession
} from './debugNetwork';
import {
  DEFAULT_ROOM_ID,
  useOnlineSession,
  type LobbySettings,
  type NetworkAction,
  type OnlineSession,
  type OnlineState,
  type RoomMember
} from './network';
import { useRoomDirectoryAdvertiser } from './roomDirectory';
import { isValidRoomCode } from './roomCodes';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { useSessionStorageState } from './hooks/useSessionStorageState';
import { useDebugScreensController } from './debugScreens';
import { createDebugNamespace, createSessionNamespace, getSessionIdFromHash, storageKeys } from './storage';

const LOCAL_DEBUG_SETUP = {
  playerNames: ['Ari', 'Blair', 'Casey'],
  playerIds: ['p1', 'p2', 'p3'],
  shuffleSeed: 17
};

const MAX_PEG_PIPS = 4;
const ROOM_QUERY_PARAM = 'room';
const ROOM_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,31})$/;

type PegPipState = 'filled' | 'hollow' | 'unused';
type PendingCardAction = 'play' | 'discard' | 'hint-color' | 'hint-number' | null;
type ClientRuntime = 'standard' | 'debug-network-frame';

const suitColors: Record<Suit, string> = {
  R: '#e64d5f',
  Y: '#f4c21b',
  G: '#2dc96d',
  B: '#4f8eff',
  W: '#2dd4bf',
  M: '#8b5cf6'
};

const suitBadgeForeground: Record<Suit, string> = {
  R: '#fff',
  Y: '#101114',
  G: '#101114',
  B: '#fff',
  W: '#101114',
  M: '#fff'
};

const suitNames: Record<Suit, string> = {
  R: 'red',
  Y: 'yellow',
  G: 'green',
  B: 'blue',
  W: 'ice',
  M: 'multicolor'
};

const suitIcons: Record<Suit, ComponentType<IconProps>> = {
  R: Heart,
  Y: Sun,
  G: Leaf,
  B: Drop,
  W: Snowflake,
  M: Rainbow
};

function SuitSymbol({
  suit,
  size = 14,
  weight = 'fill',
  className
}: {
  suit: Suit;
  size?: number;
  weight?: IconProps['weight'];
  className?: string;
}) {
  const Icon = suitIcons[suit];
  return <Icon size={size} weight={weight} className={className} aria-hidden />;
}

function DeckCount({ value }: { value: number }) {
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(value);

  useEffect(() => {
    const last = lastValueRef.current;
    if (last === value) {
      return;
    }

    lastValueRef.current = value;
    setPreviousValue(last);
    setDirection(value > last ? 'up' : 'down');

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setPreviousValue(null);
      setDirection(null);
    }, 260);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const ticking = previousValue !== null && direction !== null;

  return (
    <span
      className={`deck-count ${ticking ? `deck-count-tick ${direction}` : ''}`}
      data-testid="status-deck-count"
      aria-label={`Deck ${value}`}
    >
      {ticking ? (
        <>
          <span className="deck-count-value prev" aria-hidden>{previousValue}</span>
          <span className="deck-count-value next">{value}</span>
        </>
      ) : (
        <span className="deck-count-value single">{value}</span>
      )}
    </span>
  );
}

function LastActionTicker({ id, message }: { id: string; message: ReactNode }) {
  const [previous, setPrevious] = useState<ReactNode | null>(null);
  const [current, setCurrent] = useState<ReactNode>(message);
  const [currentId, setCurrentId] = useState(id);
  const [isTicking, setIsTicking] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (currentId === id) {
      return;
    }

    setPrevious(current);
    setCurrent(message);
    setCurrentId(id);
    setIsTicking(true);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setIsTicking(false);
      setPrevious(null);
    }, 320);
  }, [currentId, id, message]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span className={`last-action-ticker ${isTicking ? 'ticking' : ''}`}>
      {previous !== null && (
        <span className="last-action-message leaving" aria-hidden>
          {previous}
        </span>
      )}
      <span className={`last-action-message ${previous !== null ? 'entering' : ''}`}>
        {current}
      </span>
    </span>
  );
}

function LogCardChip({ suit, number }: { suit: Suit; number: number }) {
  return (
    <span
      className="log-chip log-chip-card"
      style={{ '--chip-color': suitColors[suit], '--chip-fg': suitBadgeForeground[suit] } as CSSProperties}
      aria-label={`${suitNames[suit]} ${number}`}
    >
      <span className="log-card-num">{number}</span>
      <SuitSymbol suit={suit} size={13} className="log-card-suit" />
    </span>
  );
}

function LogHintChipNumber({ number }: { number: number }) {
  return (
    <span className="log-chip log-chip-number" aria-label={`number ${number}`}>
      {number}
    </span>
  );
}

function LogHintChipSuit({ suit }: { suit: Suit }) {
  return (
    <span
      className="log-chip log-chip-suit"
      style={{ '--chip-color': suitColors[suit], '--chip-fg': suitBadgeForeground[suit] } as CSSProperties}
      aria-label={suitNames[suit]}
    >
      <SuitSymbol suit={suit} size={15} />
    </span>
  );
}

function getPegPipStates(remaining: number, total: number): PegPipState[] {
  const clampedRemaining = Math.min(Math.max(remaining, 0), MAX_PEG_PIPS);
  const clampedTotal = Math.min(Math.max(total, 0), MAX_PEG_PIPS);

  return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
    if (index >= clampedTotal) return 'unused';
    if (index < clampedRemaining) return 'filled';
    return 'hollow';
  });
}

function PegPips({ pipStates }: { pipStates: PegPipState[] }) {
  const visible = pipStates
    .map((state, index) => ({ state, index }))
    .filter((pip) => pip.state !== 'unused');

  if (visible.length === 0) {
    return null;
  }

  return (
    <>
      {[...visible].reverse().map((pip) => (
        <span key={`pip-${pip.index}`} className={`peg-pip ${pip.state}`} aria-hidden />
      ))}
    </>
  );
}

function isTerminalStatus(status: HanabiPerspectiveState['status']): boolean {
  return status === 'won' || status === 'lost' || status === 'finished';
}

function renderLogMessage(log: GameLogEntry): ReactNode {
  if (log.type === 'hint') {
    const touchedCount = log.touchedCardIds.length;
    if (log.hintType === 'number') {
      if (log.number === null) return `${log.actorName} gave a number hint to ${log.targetName}`;
      return (
        <>
          {log.actorName} hinted {touchedCount}x{' '}
          <LogHintChipNumber number={log.number} />{' '}
          to {log.targetName}
        </>
      );
    }

    if (log.suit === null) return `${log.actorName} gave a color hint to ${log.targetName}`;
    return (
      <>
        {log.actorName} hinted {touchedCount}x{' '}
        <LogHintChipSuit suit={log.suit} />{' '}
        to {log.targetName}
      </>
    );
  }

  if (log.type === 'play') {
    if (log.success) {
      return (
        <>
          {log.actorName} played <LogCardChip suit={log.suit} number={log.number} />
        </>
      );
    }

    return (
      <>
        {log.actorName} misplayed <LogCardChip suit={log.suit} number={log.number} /> and burned a fuse
      </>
    );
  }

  if (log.type === 'discard') {
    if (log.gainedHint) {
      return (
        <>
          {log.actorName} discarded <LogCardChip suit={log.suit} number={log.number} /> and regained a hint
        </>
      );
    }

    return (
      <>
        {log.actorName} discarded <LogCardChip suit={log.suit} number={log.number} />
      </>
    );
  }

  if (log.type === 'draw') {
    return `${log.actorName} drew a card (${log.remainingDeck} left)`;
  }

  if (log.status === 'won') {
    return `Game won with score ${log.score}`;
  }

  if (log.status === 'lost') {
    return `Game lost with score ${log.score}`;
  }

  if (log.reason === 'final_round_complete') {
    return `Final round complete with score ${log.score}`;
  }

  return `Game finished with score ${log.score}`;
}

function getLogBadge(log: GameLogEntry): string {
  if (log.type === 'hint') return 'Hint';
  if (log.type === 'play') return 'Play';
  if (log.type === 'discard') return 'Discard';
  if (log.type === 'draw') return 'Draw';
  return 'Status';
}

function doesCardMatchColorHint(settings: HanabiState['settings'], cardSuit: Suit, hintSuit: Suit): boolean {
  if (cardSuit === hintSuit) {
    return true;
  }

  return settings.multicolorWildHints && cardSuit === 'M' && hintSuit !== 'M';
}

type HintRedundancy =
  | { hintType: 'number'; number: CardNumber }
  | { hintType: 'color'; suit: Suit };

function getHintTouchedCardIds(state: HanabiState, targetPlayerId: PlayerId, hint: HintRedundancy): CardId[] {
  const target = state.players.find((player) => player.id === targetPlayerId);
  if (!target) {
    return [];
  }

  if (hint.hintType === 'number') {
    return target.cards.filter((cardId) => state.cards[cardId]?.number === hint.number);
  }

  return target.cards.filter((cardId) => {
    const card = state.cards[cardId];
    if (!card) {
      return false;
    }

    return doesCardMatchColorHint(state.settings, card.suit, hint.suit);
  });
}

function isRedundantHint(state: HanabiState, targetPlayerId: PlayerId, hint: HintRedundancy): { redundant: boolean; touchedCardIds: CardId[] } {
  const target = state.players.find((player) => player.id === targetPlayerId);
  if (!target) {
    return { redundant: false, touchedCardIds: [] };
  }

  const touchedCardIds = getHintTouchedCardIds(state, targetPlayerId, hint);
  const touchedSet = new Set(touchedCardIds);

  let wouldChange = false;
  if (hint.hintType === 'number') {
    for (const cardId of target.cards) {
      const card = state.cards[cardId];
      if (!card) {
        continue;
      }

      if (touchedSet.has(cardId)) {
        if (card.hints.number !== hint.number || card.hints.notNumbers.includes(hint.number)) {
          wouldChange = true;
          break;
        }
      } else if (!card.hints.notNumbers.includes(hint.number)) {
        wouldChange = true;
        break;
      }
    }

    return { redundant: !wouldChange, touchedCardIds };
  }

  if (state.settings.multicolorWildHints && hint.suit !== 'M') {
    const allowedSuits: Suit[] = [hint.suit, 'M'];
    for (const cardId of target.cards) {
      const card = state.cards[cardId];
      if (!card) {
        continue;
      }

      const touched = touchedSet.has(cardId);
      const currentPossibleSuits = card.hints.color !== null
        ? [card.hints.color]
        : state.settings.activeSuits.filter((suit) => !card.hints.notColors.includes(suit));
      const nextPossibleSuits = touched
        ? currentPossibleSuits.filter((candidate) => allowedSuits.includes(candidate))
        : currentPossibleSuits.filter((candidate) => !allowedSuits.includes(candidate));

      if (!arraysEqual(currentPossibleSuits, nextPossibleSuits)) {
        wouldChange = true;
        break;
      }
    }

    return { redundant: !wouldChange, touchedCardIds };
  }

  for (const cardId of target.cards) {
    const card = state.cards[cardId];
    if (!card) {
      continue;
    }

    if (touchedSet.has(cardId)) {
      if (card.hints.color !== hint.suit || card.hints.notColors.includes(hint.suit)) {
        wouldChange = true;
        break;
      }
    } else if (!card.hints.notColors.includes(hint.suit)) {
      wouldChange = true;
      break;
    }
  }

  return { redundant: !wouldChange, touchedCardIds };
}

function normalizeShellPlayers(input: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawValue of input) {
    if (typeof rawValue !== 'string') {
      continue;
    }

    const value = rawValue.trim();
    if (value.length === 0 || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  if (normalized.length === 0) {
    normalized.push('1');
  }

  return normalized;
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function sanitizeLobbyName(raw: string): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, 24);
}

function normalizeRoomId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim();
  if (!ROOM_ID_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function resolveRoomIdFromUrl(url: URL): string {
  return normalizeRoomId(url.searchParams.get(ROOM_QUERY_PARAM)) ?? DEFAULT_ROOM_ID;
}

function writeRoomIdToHistory(roomId: string, mode: 'push' | 'replace'): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) {
    throw new Error('Room id must be 1-32 chars using letters, numbers, "-" or "_"');
  }

  const url = new URL(window.location.href);
  if (normalizedRoomId === DEFAULT_ROOM_ID) {
    url.searchParams.delete(ROOM_QUERY_PARAM);
  } else {
    url.searchParams.set(ROOM_QUERY_PARAM, normalizedRoomId);
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) {
    return;
  }

  if (mode === 'push') {
    window.history.pushState(null, '', nextUrl);
    return;
  }

  window.history.replaceState(null, '', nextUrl);
}

async function writeToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is unavailable in this runtime');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) {
    throw new Error('Failed to copy to clipboard');
  }
}

function parseHanabiStatePayload(rawText: string): HanabiState {
  const parsed = JSON.parse(rawText) as unknown;
  const candidate =
    parsed && typeof parsed === 'object' && 'state' in parsed
      ? (parsed as { state: unknown }).state
      : parsed;

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Invalid state payload: expected an object');
  }

  return HanabiGame.fromState(candidate as HanabiState).getSnapshot();
}

function App({
  roomCode = DEFAULT_ROOM_ID,
  onLeaveRoom
}: {
  roomCode?: string;
  onLeaveRoom?: () => void;
}) {
  const allowRoomQueryRouting = roomCode === DEFAULT_ROOM_ID;
  const [roomId, setRoomId] = useState<string>(() => {
    if (!allowRoomQueryRouting) {
      return roomCode;
    }

    if (typeof window === 'undefined') {
      return DEFAULT_ROOM_ID;
    }

    return resolveRoomIdFromUrl(new URL(window.location.href));
  });
  const [hash, setHash] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.location.hash;
  });
  const [debugFramePlayerId, setDebugFramePlayerId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return getDebugNetworkPlayerIdFromHash(window.location.hash);
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onHashChange = (): void => {
      const nextHash = window.location.hash;
      setHash(nextHash);
      setDebugFramePlayerId(getDebugNetworkPlayerIdFromHash(nextHash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => {
    if (!allowRoomQueryRouting) {
      const normalizedRoomId = normalizeRoomId(roomCode);
      if (!normalizedRoomId) {
        throw new Error('Room code must be 1-32 chars using letters, numbers, "-" or "_"');
      }

      setRoomId(normalizedRoomId);
      return;
    }

    if (typeof window === 'undefined') {
      setRoomId(DEFAULT_ROOM_ID);
      return;
    }

    setRoomId(resolveRoomIdFromUrl(new URL(window.location.href)));
  }, [allowRoomQueryRouting, roomCode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !allowRoomQueryRouting) {
      return;
    }

    const onPopState = (): void => {
      setRoomId(resolveRoomIdFromUrl(new URL(window.location.href)));
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [allowRoomQueryRouting]);

  useEffect(() => {
    if (!allowRoomQueryRouting) {
      return;
    }

    writeRoomIdToHistory(roomId, 'replace');
  }, [allowRoomQueryRouting, roomId]);

  const storageNamespace = useMemo(() => {
    if (debugFramePlayerId) {
      return createDebugNamespace(debugFramePlayerId);
    }

    const sessionId = getSessionIdFromHash(hash);
    return sessionId ? createSessionNamespace(sessionId) : null;
  }, [debugFramePlayerId, hash]);

  const [isDebugNetworkShellOpen, setIsDebugNetworkShellOpen] = useLocalStorageState(
    storageKeys.debugNetworkShell,
    false,
    storageNamespace
  );
  const [isDarkMode, setIsDarkMode] = useLocalStorageState(storageKeys.darkMode, false, storageNamespace);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    meta?.setAttribute('content', isDarkMode ? '#0b0d14' : '#f5f7fc');
  }, [isDarkMode]);

  if (debugFramePlayerId) {
    return (
      <GameClient
        runtime="debug-network-frame"
        roomId={roomId}
        framePlayerId={debugFramePlayerId}
        onOpenDebugNetworkShell={null}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((current) => !current)}
        onLeaveRoom={onLeaveRoom ?? null}
        storageNamespace={storageNamespace}
      />
    );
  }

  if (isDebugNetworkShellOpen) {
    return (
      <DebugNetworkShell
        onExit={() => setIsDebugNetworkShellOpen(false)}
        storageNamespace={storageNamespace}
      />
    );
  }

  return (
    <GameClient
      runtime="standard"
      roomId={roomId}
      framePlayerId={null}
      onOpenDebugNetworkShell={() => setIsDebugNetworkShellOpen(true)}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode((current) => !current)}
      onLeaveRoom={onLeaveRoom ?? null}
      storageNamespace={storageNamespace}
    />
  );
}

function DebugNetworkShell({ onExit, storageNamespace }: { onExit: () => void; storageNamespace: string | null }) {
  const [storedPlayers, setStoredPlayers] = useLocalStorageState(
    storageKeys.debugNetworkPlayers,
    getDebugNetworkPlayersFromRoom()
    ,
    storageNamespace
  );
  const normalizedPlayers = useMemo(() => normalizeShellPlayers(storedPlayers), [storedPlayers]);
  const [activePlayer, setActivePlayer] = useLocalStorageState(
    storageKeys.debugNetworkActivePlayer,
    normalizedPlayers[0],
    storageNamespace
  );

  useEffect(() => {
    if (arraysEqual(storedPlayers, normalizedPlayers)) {
      return;
    }

    setStoredPlayers(normalizedPlayers);
  }, [normalizedPlayers, setStoredPlayers, storedPlayers]);

  useEffect(() => {
    if (normalizedPlayers.includes(activePlayer)) {
      return;
    }

    setActivePlayer(normalizedPlayers[0]);
  }, [activePlayer, normalizedPlayers, setActivePlayer]);

  useEffect(() => {
    syncDebugNetworkRoomPlayers(normalizedPlayers);
  }, [normalizedPlayers]);

  const iframeUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const url = new URL(window.location.href);
    url.hash = toDebugNetworkPlayerHash(activePlayer);
    return url.toString();
  }, [activePlayer]);

  function handleAddPlayer(): void {
    setStoredPlayers((currentPlayers) => {
      const normalized = normalizeShellPlayers(currentPlayers);
      const nextNumericId = normalized.reduce((max, playerId) => {
        const numeric = Number(playerId);
        if (!Number.isFinite(numeric)) {
          return max;
        }

        return Math.max(max, numeric);
      }, 0) + 1;
      const nextPlayerId = String(nextNumericId);
      setActivePlayer(nextPlayerId);
      return [...normalized, nextPlayerId];
    });
  }

  function handleRemovePlayer(): void {
    setStoredPlayers((currentPlayers) => {
      const normalized = normalizeShellPlayers(currentPlayers);
      if (normalized.length <= 1) {
        return normalized;
      }

      const activeIndex = normalized.indexOf(activePlayer);
      if (activeIndex === -1) {
        return normalized;
      }

      const nextPlayers = normalized.filter((playerId) => playerId !== activePlayer);
      const nextIndex = Math.min(activeIndex, nextPlayers.length - 1);
      setActivePlayer(nextPlayers[nextIndex]);
      return nextPlayers;
    });
  }

  function handleSelectPlayer(playerId: string): void {
    setActivePlayer(playerId);
  }

  return (
    <main className="debug-network-shell" data-testid="debug-network-shell">
      <iframe
        title={`Debug Network Player ${activePlayer}`}
        src={iframeUrl}
        className="debug-network-frame"
        data-testid="debug-network-frame"
      />

      <section className="debug-network-bar" data-testid="debug-network-bar">
        <div className="debug-network-player-list">
          {normalizedPlayers.map((playerId, index) => (
            <button
              type="button"
              key={playerId}
              className={`debug-network-player ${playerId === activePlayer ? 'active' : ''}`}
              data-testid={`debug-network-player-${playerId}`}
              onClick={() => handleSelectPlayer(playerId)}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div className="debug-network-controls">
          <button
            type="button"
            className="debug-network-control"
            onClick={handleAddPlayer}
            data-testid="debug-network-add"
          >
            Add
          </button>
          <button
            type="button"
            className="debug-network-control"
            onClick={handleRemovePlayer}
            data-testid="debug-network-remove"
          >
            Remove
          </button>
          <button
            type="button"
            className="debug-network-control"
            onClick={onExit}
            data-testid="debug-network-exit"
          >
            Exit
          </button>
        </div>
      </section>
    </main>
  );
}

function GameClient({
  runtime,
  roomId,
  framePlayerId,
  onOpenDebugNetworkShell,
  isDarkMode,
  onToggleDarkMode,
  onLeaveRoom,
  storageNamespace
}: {
  runtime: ClientRuntime;
  roomId: string;
  framePlayerId: string | null;
  onOpenDebugNetworkShell: (() => void) | null;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLeaveRoom: (() => void) | null;
  storageNamespace: string | null;
}) {
  const isDebugNetworkFrame = runtime === 'debug-network-frame';

  const gameRef = useRef<HanabiGame | null>(null);
  if (!gameRef.current) {
    gameRef.current = new HanabiGame(LOCAL_DEBUG_SETUP);
  }

  const debugGame = gameRef.current;
  const [debugGameState, setDebugGameState] = useState(() => debugGame.getSnapshot());
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [isLogDrawerMounted, setIsLogDrawerMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLeaveGameArmed, setIsLeaveGameArmed] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingCardAction>(null);
  const [endgamePanel, setEndgamePanel] = useState<'summary' | 'log'>('summary');
  const [wildColorHintTargetPlayerId, setWildColorHintTargetPlayerId] = useState<PlayerId | null>(null);
  const [isDebugMode, setIsDebugMode] = useLocalStorageState(storageKeys.debugMode, false, storageNamespace);
  const [playerName, setPlayerName] = useLocalStorageState(storageKeys.playerName, '', storageNamespace);
  const [isTvMode, setIsTvMode] = useSessionStorageState(storageKeys.tvMode, false, storageNamespace);
  const [showNegativeColorHints, setShowNegativeColorHints] = useLocalStorageState(
    storageKeys.negativeColorHints,
    true,
    storageNamespace
  );
  const [showNegativeNumberHints, setShowNegativeNumberHints] = useLocalStorageState(
    storageKeys.negativeNumberHints,
    true,
    storageNamespace
  );
  const logListRef = useRef<HTMLDivElement | null>(null);
  const animationLayerRef = useRef<HTMLDivElement | null>(null);
  const deckPillRef = useRef<HTMLDivElement | null>(null);
  const cardNodeByIdRef = useRef<Map<CardId, HTMLButtonElement>>(new Map());
  const cardFxListenerByNodeRef = useRef<WeakMap<HTMLButtonElement, Map<string, (event: AnimationEvent) => void>>>(new WeakMap());
  const hintTokenSlotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const fuseTokenSlotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [isActionAnimationRunning, setIsActionAnimationRunning] = useState(false);
  const [turnLockPlayerId, setTurnLockPlayerId] = useState<PlayerId | null>(null);
  const logDrawerTokenRef = useRef(0);
  const logDrawerCloseTimeoutRef = useRef<number | null>(null);
  const animationRunIdRef = useRef(0);
  const prevGameStateRef = useRef<HanabiState | null>(null);
  const layoutSnapshotRef = useRef<{ deckRect: DOMRect | null; cardRects: Map<CardId, DOMRect> } | null>(null);
  const prevLayoutSnapshotRef = useRef<{ deckRect: DOMRect | null; cardRects: Map<CardId, DOMRect> } | null>(null);

  const resetUiForDebugScreens = useCallback(() => {
    animationRunIdRef.current += 1;
    prevGameStateRef.current = null;
    layoutSnapshotRef.current = null;
    prevLayoutSnapshotRef.current = null;
    setIsActionAnimationRunning(false);
    setTurnLockPlayerId(null);
    setIsMenuOpen(false);
    setIsLogDrawerOpen(false);
    setIsLogDrawerMounted(false);
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);
    setEndgamePanel('summary');
    if (animationLayerRef.current) {
      animationLayerRef.current.innerHTML = '';
    }
  }, []);

  useDebugScreensController({
    enabled: !isDebugNetworkFrame,
    setIsDebugMode,
    debugGame,
    setDebugGameState,
    resetUi: resetUiForDebugScreens
  });

  const isLocalDebugMode = !isDebugNetworkFrame && isDebugMode;
  const online = useOnlineSession(!isLocalDebugMode && !isDebugNetworkFrame, roomId);
  const debugNetwork = useDebugNetworkSession(isDebugNetworkFrame ? framePlayerId : null);
  const activeSession: OnlineSession = isDebugNetworkFrame ? debugNetwork : online;
  const onlineState = activeSession.state;
  const setActiveSelfName = activeSession.setSelfName;
  const setActiveSelfIsTv = activeSession.setSelfIsTv;

  useEffect(() => {
    if (isLocalDebugMode) {
      return;
    }

    setActiveSelfName(playerName);
  }, [isLocalDebugMode, playerName, setActiveSelfName]);

  useEffect(() => {
    if (isLocalDebugMode || !onlineState.selfId) {
      return;
    }

    if (onlineState.phase !== 'lobby') {
      return;
    }

    const memberName = onlineState.members.find((member) => member.peerId === onlineState.selfId)?.name ?? null;
    if (!memberName) {
      return;
    }

    const sanitizedLocalName = sanitizeLobbyName(playerName);
    if (!sanitizedLocalName || memberName === sanitizedLocalName || memberName === playerName) {
      return;
    }

    const normalizedMemberName = memberName.trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizedDesiredName = sanitizedLocalName.trim().replace(/\s+/g, ' ').toLowerCase();
    const disambiguated = normalizedMemberName.match(/^(.*) (\d+)$/);
    if (!disambiguated) {
      return;
    }

    const base = disambiguated[1]?.trim() ?? '';
    if (base.length === 0) {
      return;
    }

    if (normalizedDesiredName === base || normalizedDesiredName.startsWith(base)) {
      setPlayerName(memberName);
    }
  }, [isLocalDebugMode, onlineState.members, onlineState.phase, onlineState.selfId, playerName, setPlayerName]);

  useEffect(() => {
    if (isLocalDebugMode) {
      return;
    }

    setActiveSelfIsTv(isTvMode);
  }, [isLocalDebugMode, isTvMode, setActiveSelfIsTv]);

  const activeGameState = isLocalDebugMode ? debugGameState : onlineState.gameState;
  const terminalStatusLogId = useMemo(() => {
    if (!activeGameState) {
      return null;
    }

    for (let index = activeGameState.logs.length - 1; index >= 0; index -= 1) {
      const log = activeGameState.logs[index];
      if (log.type === 'status') {
        return log.id;
      }
    }

    return null;
  }, [activeGameState]);
  const endgameStatsByPlayerId = useMemo(() => {
    const stats = new Map<PlayerId, { hintsGiven: number; hintsReceived: number; plays: number; discards: number }>();
    if (!activeGameState) {
      return stats;
    }

    for (const player of activeGameState.players) {
      stats.set(player.id, { hintsGiven: 0, hintsReceived: 0, plays: 0, discards: 0 });
    }

    for (const log of activeGameState.logs) {
      if (log.type === 'hint') {
        const actor = stats.get(log.actorId);
        const target = stats.get(log.targetId);
        if (actor) actor.hintsGiven += 1;
        if (target) target.hintsReceived += 1;
        continue;
      }

      if (log.type === 'play') {
        const actor = stats.get(log.actorId);
        if (actor) actor.plays += 1;
        continue;
      }

      if (log.type === 'discard') {
        const actor = stats.get(log.actorId);
        if (actor) actor.discards += 1;
      }
    }

    return stats;
  }, [activeGameState]);
  useEffect(() => {
    setEndgamePanel('summary');
  }, [terminalStatusLogId]);
  const discardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!activeGameState) {
      return counts;
    }

    for (const cardId of activeGameState.discardPile) {
      const card = activeGameState.cards[cardId];
      if (!card) {
        continue;
      }

      const key = `${card.suit}-${card.number}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
  }, [activeGameState]);
  const activeGame = useMemo(() => {
    if (isLocalDebugMode) {
      return debugGame;
    }

    if (!onlineState.gameState) {
      return null;
    }

    return HanabiGame.fromState(onlineState.gameState);
  }, [debugGame, isLocalDebugMode, onlineState.gameState]);

  const isOnlineParticipant = useMemo(() => {
    if (isLocalDebugMode || !onlineState.selfId || !onlineState.gameState) {
      return false;
    }

    return onlineState.gameState.players.some((player) => player.id === onlineState.selfId);
  }, [isLocalDebugMode, onlineState.gameState, onlineState.selfId]);

  const isOnlineTvMember = useMemo(() => {
    if (isLocalDebugMode || !onlineState.selfId) {
      return false;
    }

    return onlineState.members.find((member) => member.peerId === onlineState.selfId)?.isTv ?? false;
  }, [isLocalDebugMode, onlineState.members, onlineState.selfId]);

  const isTvClient = !isLocalDebugMode && (isTvMode || isOnlineTvMember);
  const showTv = isTvClient && !isOnlineParticipant && onlineState.phase === 'playing' && onlineState.gameState !== null;

  const showLobby = !isLocalDebugMode && (
    onlineState.phase === 'lobby'
    || onlineState.gameState === null
    || (!isOnlineParticipant && !showTv)
  );

  const shouldAdvertiseRoom = !isLocalDebugMode
    && !isDebugNetworkFrame
    && onlineState.status === 'connected'
    && onlineState.isHost
    && onlineState.phase === 'lobby'
    && isValidRoomCode(roomId);

  const directoryMembers = useMemo(
    () => onlineState.members.map((member) => ({ name: member.name, isTv: member.isTv })),
    [onlineState.members]
  );

  useRoomDirectoryAdvertiser({
    enabled: shouldAdvertiseRoom,
    code: roomId,
    snapshotVersion: onlineState.snapshotVersion,
    members: directoryMembers
  });

  const perspectivePlayerId = useMemo(() => {
    if (!activeGameState) {
      return null;
    }

    if (isLocalDebugMode) {
      return activeGameState.players[activeGameState.currentTurnPlayerIndex]?.id ?? null;
    }

    if (!onlineState.selfId) {
      return null;
    }

    const localPlayer = activeGameState.players.find((player) => player.id === onlineState.selfId);
    return localPlayer?.id ?? null;
  }, [activeGameState, isLocalDebugMode, onlineState.selfId]);

  const perspective = useMemo(() => {
    if (!activeGame || !perspectivePlayerId) {
      return null;
    }

    return activeGame.getPerspectiveState(perspectivePlayerId);
  }, [activeGame, activeGameState, perspectivePlayerId]);

  useLayoutEffect(() => {
    prevLayoutSnapshotRef.current = layoutSnapshotRef.current;
    const deckRect = deckPillRef.current?.getBoundingClientRect() ?? null;
    const cardRects = new Map<CardId, DOMRect>();
    for (const [cardId, node] of cardNodeByIdRef.current) {
      cardRects.set(cardId, node.getBoundingClientRect());
    }

    layoutSnapshotRef.current = { deckRect, cardRects };
  });

  useEffect(() => {
    if (!isLogDrawerOpen) return;
    logListRef.current?.scrollTo({ top: 0 });
  }, [isLogDrawerOpen]);

  useEffect(() => {
    return () => {
      if (logDrawerCloseTimeoutRef.current !== null) {
        window.clearTimeout(logDrawerCloseTimeoutRef.current);
        logDrawerCloseTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);
  }, [isLocalDebugMode, onlineState.snapshotVersion, perspective?.turn]);

  useEffect(() => {
    if (isLocalDebugMode) {
      return;
    }

    setIsMenuOpen(false);
  }, [isLocalDebugMode]);

  function triggerSvgFx(svg: SVGElement, fxClass: string): void {
    svg.classList.remove(fxClass);
    void svg.getBoundingClientRect();
    svg.classList.add(fxClass);
    svg.addEventListener('animationend', () => svg.classList.remove(fxClass), { once: true });
  }

  function triggerTokenFx(slot: HTMLSpanElement | null, fxClass: string): void {
    const svg = slot?.querySelector('svg');
    if (!(svg instanceof SVGElement)) {
      return;
    }

    triggerSvgFx(svg, fxClass);
  }

  function triggerCardFx(cardId: CardId, fxClass: string): void {
    const node = cardNodeByIdRef.current.get(cardId);
    if (!node) {
      return;
    }

    const expectedAnimationName =
      fxClass === 'hint-enter'
        ? 'hint-ring'
        : fxClass === 'hint-redundant'
          ? 'hint-redundant-ring'
          : null;

    const listenerMap = cardFxListenerByNodeRef.current.get(node) ?? new Map();
    const existingListener = listenerMap.get(fxClass);
    if (existingListener) {
      node.removeEventListener('animationend', existingListener);
    }

    node.classList.remove(fxClass);
    void node.getBoundingClientRect();
    node.classList.add(fxClass);

    const onEnd = (event: AnimationEvent): void => {
      if (expectedAnimationName && event.animationName !== expectedAnimationName) {
        return;
      }

      node.classList.remove(fxClass);
      node.removeEventListener('animationend', onEnd);
      listenerMap.delete(fxClass);
    };

    listenerMap.set(fxClass, onEnd);
    cardFxListenerByNodeRef.current.set(node, listenerMap);
    node.addEventListener('animationend', onEnd);
  }

  function createGhostCardElement({
    suit,
    number,
    face
  }: {
    suit: Suit | null;
    number: number | null;
    face: 'front' | 'back';
  }): { root: HTMLDivElement; inner: HTMLDivElement; crack: HTMLDivElement } | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const root = document.createElement('div');
    root.className = 'ghost-card';

    if (suit) {
      root.style.setProperty('--card-bg', suitColors[suit]);
      root.style.setProperty('--card-fg', suitBadgeForeground[suit]);
    } else {
      root.style.setProperty('--card-bg', '#9eb2d4');
      root.style.setProperty('--card-fg', '#101114');
    }

    const inner = document.createElement('div');
    inner.className = 'ghost-card-inner';
    inner.style.transform = face === 'front' ? 'rotateY(180deg)' : 'rotateY(0deg)';

    const back = document.createElement('div');
    back.className = 'ghost-card-face back';
    const backMark = document.createElement('div');
    backMark.className = 'ghost-card-back-mark';
    backMark.textContent = 'H';
    back.appendChild(backMark);

    const front = document.createElement('div');
    front.className = 'ghost-card-face front';
    const frontValue = document.createElement('div');
    frontValue.className = 'ghost-card-front-value';
    frontValue.textContent = number === null ? '?' : String(number);
    const frontSuit = document.createElement('div');
    frontSuit.className = 'ghost-card-front-suit';
    frontSuit.textContent = suit === null ? '' : suit;
    front.appendChild(frontValue);
    front.appendChild(frontSuit);

    const crack = document.createElement('div');
    crack.className = 'ghost-card-crack';

    inner.appendChild(back);
    inner.appendChild(front);
    root.appendChild(inner);
    root.appendChild(crack);

    return { root, inner, crack };
  }

  async function animateDrawCard({
    drawnCardId,
    actorId,
    viewerIdForVisibility
  }: {
    drawnCardId: CardId;
    actorId: PlayerId;
    viewerIdForVisibility: PlayerId | null;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const deckRect = layoutSnapshotRef.current?.deckRect ?? null;
    const destRect = layoutSnapshotRef.current?.cardRects.get(drawnCardId) ?? null;
    const destNode = cardNodeByIdRef.current.get(drawnCardId) ?? null;

    if (!layer || !deckRect || !destRect || !destNode) {
      return;
    }

    const card = activeGameState?.cards[drawnCardId] ?? null;
    const showFront = card && actorId !== viewerIdForVisibility;
    const ghost = createGhostCardElement({
      suit: showFront ? card.suit : null,
      number: showFront ? card.number : null,
      face: showFront ? 'front' : 'back'
    });
    if (!ghost) {
      return;
    }

    const startLeft = deckRect.left + deckRect.width / 2 - destRect.width / 2;
    const startTop = deckRect.top + deckRect.height / 2 - destRect.height / 2;

    ghost.root.style.left = `${startLeft}px`;
    ghost.root.style.top = `${startTop}px`;
    ghost.root.style.width = `${destRect.width}px`;
    ghost.root.style.height = `${destRect.height}px`;

    layer.appendChild(ghost.root);

    const dx = destRect.left - startLeft;
    const dy = destRect.top - startTop;

    const originalOpacity = destNode.style.opacity;
    destNode.style.opacity = '0';

    try {
      await animate(
        ghost.root,
        {
          x: [0, dx * 0.86, dx],
          y: [0, dy * 0.86, dy],
          scale: [0.14, 1.08, 1],
          rotate: [-10, 2, 0],
          opacity: [0.6, 1, 1]
        },
        { duration: 0.5, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;

      await animate(destNode, { opacity: [0, 1], scale: [0.98, 1] }, { duration: 0.16, ease: [0.2, 0.85, 0.2, 1] }).finished;
    } finally {
      ghost.root.remove();
      destNode.style.opacity = originalOpacity;
      destNode.style.removeProperty('scale');
    }
  }

  async function animatePlayToPeg({
    cardId,
    suit,
    number,
    shouldFlip
  }: {
    cardId: CardId;
    suit: Suit;
    number: number;
    shouldFlip: boolean;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const fromRect = prevLayoutSnapshotRef.current?.cardRects.get(cardId) ?? null;
    const peg = typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>(`[data-testid="peg-${suit}-${number}"]`);
    const toRect = peg?.getBoundingClientRect() ?? null;

    if (!layer || !fromRect || !peg || !toRect) {
      return;
    }

    const ghost = createGhostCardElement({ suit, number, face: shouldFlip ? 'back' : 'front' });
    if (!ghost) {
      return;
    }

    ghost.root.style.left = `${fromRect.left}px`;
    ghost.root.style.top = `${fromRect.top}px`;
    ghost.root.style.width = `${fromRect.width}px`;
    ghost.root.style.height = `${fromRect.height}px`;

    layer.appendChild(ghost.root);

    const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
    const scaleTo = Math.max(0.22, Math.min(0.42, toRect.width / fromRect.width));

    try {
      const zoomControls = animate(ghost.root, { y: -14, scale: 1.1, rotate: -2 }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] });
      const flipControls = shouldFlip
        ? animate(ghost.inner, { rotateY: [0, 180] }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] })
        : null;

      await Promise.all([zoomControls.finished, flipControls?.finished]);

      await animate(
        ghost.root,
        { x: dx, y: dy, scale: scaleTo, rotate: 0, opacity: [1, 0.2] },
        { duration: 0.66, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;

      peg.classList.remove('peg-hit');
      void peg.getBoundingClientRect();
      peg.classList.add('peg-hit');
      peg.addEventListener('animationend', () => peg.classList.remove('peg-hit'), { once: true });
    } finally {
      ghost.root.remove();
    }
  }

  async function animateMisplay({
    cardId,
    suit,
    number,
    shouldFlip,
    spentFuseIndex
  }: {
    cardId: CardId;
    suit: Suit;
    number: number;
    shouldFlip: boolean;
    spentFuseIndex: number | null;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const fromRect = prevLayoutSnapshotRef.current?.cardRects.get(cardId) ?? null;
    if (!layer || !fromRect) {
      return;
    }

    const ghost = createGhostCardElement({ suit, number, face: shouldFlip ? 'back' : 'front' });
    if (!ghost) {
      return;
    }

    ghost.root.classList.add('misplay');
    ghost.root.style.left = `${fromRect.left}px`;
    ghost.root.style.top = `${fromRect.top}px`;
    ghost.root.style.width = `${fromRect.width}px`;
    ghost.root.style.height = `${fromRect.height}px`;

    layer.appendChild(ghost.root);

    try {
      const zoomControls = animate(ghost.root, { y: -14, scale: 1.1, rotate: -2 }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] });
      const flipControls = shouldFlip
        ? animate(ghost.inner, { rotateY: [0, 180] }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] })
        : null;

      await Promise.all([zoomControls.finished, flipControls?.finished]);

      ghost.root.classList.add('cracked');
      if (spentFuseIndex !== null) {
        triggerTokenFx(fuseTokenSlotRefs.current[spentFuseIndex] ?? null, 'token-fx-extinguish');
      }
      await animate(
        ghost.root,
        { y: [-14, -18, -10], scale: [1.1, 1.26, 0.86], rotate: [-2, 3, -4], opacity: [1, 1, 0] },
        { duration: 0.66, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;
    } finally {
      ghost.root.remove();
    }
  }

  async function animateDiscardExplode({
    cardId,
    suit,
    number,
    shouldFlip
  }: {
    cardId: CardId;
    suit: Suit;
    number: number;
    shouldFlip: boolean;
  }): Promise<void> {
    const layer = animationLayerRef.current;
    const fromRect = prevLayoutSnapshotRef.current?.cardRects.get(cardId) ?? null;
    if (!layer || !fromRect) {
      return;
    }

    const ghost = createGhostCardElement({ suit, number, face: shouldFlip ? 'back' : 'front' });
    if (!ghost) {
      return;
    }

    ghost.root.style.left = `${fromRect.left}px`;
    ghost.root.style.top = `${fromRect.top}px`;
    ghost.root.style.width = `${fromRect.width}px`;
    ghost.root.style.height = `${fromRect.height}px`;

    layer.appendChild(ghost.root);

    try {
      const zoomControls = animate(ghost.root, { y: -12, scale: 1.1, rotate: -2 }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] });
      const flipControls = shouldFlip
        ? animate(ghost.inner, { rotateY: [0, 180] }, { duration: 0.34, ease: [0.2, 0.85, 0.2, 1] })
        : null;

      await Promise.all([zoomControls.finished, flipControls?.finished]);

      ghost.root.classList.add('cracked');
      await animate(
        ghost.root,
        { y: [-12, -18, -10], scale: [1.1, 1.28, 0.86], rotate: [-2, 4, -6], opacity: [1, 1, 0] },
        { duration: 0.66, ease: [0.2, 0.85, 0.2, 1] }
      ).finished;
    } finally {
      ghost.root.remove();
    }
  }

  useEffect(() => {
    if (!activeGameState) {
      prevGameStateRef.current = null;
      return;
    }

    const previous = prevGameStateRef.current;
    prevGameStateRef.current = activeGameState;

    if (!previous) {
      return;
    }

    if (activeGameState.turn - previous.turn !== 1) {
      return;
    }

    const newLogs = activeGameState.logs.slice(previous.logs.length);
    if (newLogs.length === 0) {
      return;
    }

    const actionLog = [...newLogs].reverse().find((log) => log.type !== 'status') ?? null;
    if (!actionLog) {
      return;
    }

    const prevHintTokens = previous.hintTokens;
    const nextHintTokens = activeGameState.hintTokens;
    if (nextHintTokens < prevHintTokens) {
      triggerTokenFx(hintTokenSlotRefs.current[nextHintTokens] ?? null, 'token-fx-spend');
    } else if (nextHintTokens > prevHintTokens) {
      triggerTokenFx(hintTokenSlotRefs.current[prevHintTokens] ?? null, 'token-fx-gain');
    }

    if (actionLog.type === 'hint') {
      for (const cardId of actionLog.touchedCardIds) {
        triggerCardFx(cardId, 'hint-enter');
      }
      return;
    }

    if (actionLog.type !== 'play' && actionLog.type !== 'discard') {
      return;
    }

    const reduceMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canRunMotion = !reduceMotion
      && typeof document !== 'undefined'
      && typeof document.createElement('div').animate === 'function';
    if (!canRunMotion) {
      return;
    }

    const runId = animationRunIdRef.current + 1;
    animationRunIdRef.current = runId;
    setIsActionAnimationRunning(true);
    setTurnLockPlayerId(actionLog.actorId);

    const viewerIdAtAction = isLocalDebugMode
      ? previous.players[previous.currentTurnPlayerIndex]?.id ?? null
      : (perspective?.viewerId ?? null);

    const prevActor = previous.players.find((player) => player.id === actionLog.actorId);
    const nextActor = activeGameState.players.find((player) => player.id === actionLog.actorId);
    const prevHand = prevActor?.cards ?? [];
    const nextHand = nextActor?.cards ?? [];
    const prevHandSet = new Set(prevHand);
    const drawnCardId = nextHand.find((cardId) => !prevHandSet.has(cardId)) ?? null;

    const deckDelta = activeGameState.drawDeck.length - previous.drawDeck.length;
    const didDraw = deckDelta === -1 && drawnCardId !== null;

    const spentFuseIndex = (() => {
      const prevRemaining = previous.settings.maxFuseTokens - previous.fuseTokensUsed;
      const nextRemaining = activeGameState.settings.maxFuseTokens - activeGameState.fuseTokensUsed;
      if (nextRemaining !== prevRemaining - 1) {
        return null;
      }

      return nextRemaining;
    })();

    void (async () => {
      try {
        if (actionLog.type === 'play') {
          const shouldFlip = viewerIdAtAction !== null && actionLog.actorId === viewerIdAtAction;
          if (actionLog.success) {
            await animatePlayToPeg({ cardId: actionLog.cardId, suit: actionLog.suit, number: actionLog.number, shouldFlip });
          } else {
            await animateMisplay({
              cardId: actionLog.cardId,
              suit: actionLog.suit,
              number: actionLog.number,
              shouldFlip,
              spentFuseIndex
            });
          }
        }

        if (actionLog.type === 'discard') {
          const shouldFlip = viewerIdAtAction !== null && actionLog.actorId === viewerIdAtAction;
          await animateDiscardExplode({ cardId: actionLog.cardId, suit: actionLog.suit, number: actionLog.number, shouldFlip });
        }

        if (didDraw && drawnCardId) {
          await animateDrawCard({
            drawnCardId,
            actorId: actionLog.actorId,
            viewerIdForVisibility: perspective?.viewerId ?? null
          });
        }
      } finally {
        if (animationRunIdRef.current === runId) {
          setIsActionAnimationRunning(false);
          setTurnLockPlayerId(null);
        }
      }
    })();
  }, [activeGameState, isLocalDebugMode, perspective?.viewerId]);

  function commitLocal(command: () => void): void {
    try {
      command();
      setDebugGameState(debugGame.getSnapshot());
      setPendingAction(null);
    } catch {
    }
  }

  function selectOnlineAction(nextAction: PendingCardAction): void {
    if (isLocalDebugMode || !perspective || !onlineState.selfId) {
      return;
    }

    const isTurn = perspective.currentTurnPlayerId === onlineState.selfId;
    if (!isTurn || onlineState.status !== 'connected' || isTerminalStatus(perspective.status)) {
      return;
    }

    if (nextAction === 'discard' && perspective.hintTokens >= perspective.maxHintTokens) {
      return;
    }

    if ((nextAction === 'hint-color' || nextAction === 'hint-number') && perspective.hintTokens <= 0) {
      return;
    }

    setWildColorHintTargetPlayerId(null);
    setPendingAction(nextAction);
  }

  function handlePlayPress(): void {
    setWildColorHintTargetPlayerId(null);
    if (isLocalDebugMode) {
      setIsMenuOpen(false);
      commitLocal(() => {
        debugGame.beginPlaySelection();
      });
      return;
    }

    selectOnlineAction('play');
  }

  function handleDiscardPress(): void {
    setWildColorHintTargetPlayerId(null);
    if (isLocalDebugMode) {
      setIsMenuOpen(false);
      commitLocal(() => {
        debugGame.beginDiscardSelection();
      });
      return;
    }

    selectOnlineAction('discard');
  }

  function handleHintColorPress(): void {
    setWildColorHintTargetPlayerId(null);
    if (isLocalDebugMode) {
      setIsMenuOpen(false);
      commitLocal(() => {
        debugGame.beginColorHintSelection();
      });
      return;
    }

    selectOnlineAction('hint-color');
  }

  function handleHintNumberPress(): void {
    setWildColorHintTargetPlayerId(null);
    if (isLocalDebugMode) {
      setIsMenuOpen(false);
      commitLocal(() => {
        debugGame.beginNumberHintSelection();
      });
      return;
    }

    selectOnlineAction('hint-number');
  }

  function handleCardSelect(playerId: PlayerId, cardId: string): void {
    if (isLocalDebugMode) {
      setIsMenuOpen(false);
      const pending = debugGame.state.ui.pendingAction;
      const currentPlayer = debugGame.state.players[debugGame.state.currentTurnPlayerIndex];
      const selectedCard = debugGame.state.cards[cardId];

      if (!selectedCard) {
        throw new Error(`Unknown card: ${cardId}`);
      }

      if (
        pending === 'hint-color'
        && playerId !== currentPlayer.id
        && debugGame.state.settings.multicolorWildHints
        && selectedCard.suit === 'M'
      ) {
        setWildColorHintTargetPlayerId(playerId);
        return;
      }

      const selectedSuit = selectedCard.suit;
      const selectedNumber = selectedCard.number;

      if (pending === 'play') {
        if (playerId !== currentPlayer.id) {
          return;
        }

        commitLocal(() => {
          debugGame.playCard(cardId);
        });
        return;
      }

      if (pending === 'discard') {
        if (playerId !== currentPlayer.id) {
          return;
        }

        commitLocal(() => {
          debugGame.discardCard(cardId);
        });
        return;
      }

      if (pending === 'hint-color') {
        if (playerId === currentPlayer.id) {
          return;
        }

        const { redundant, touchedCardIds } = isRedundantHint(debugGame.state, playerId, { hintType: 'color', suit: selectedSuit });
        if (redundant) {
          for (const touchedId of touchedCardIds) {
            triggerCardFx(touchedId, 'hint-redundant');
          }
          return;
        }

        commitLocal(() => {
          debugGame.giveColorHint(playerId, selectedSuit);
        });
        return;
      }

      if (pending === 'hint-number') {
        if (playerId === currentPlayer.id) {
          return;
        }

        const { redundant, touchedCardIds } = isRedundantHint(debugGame.state, playerId, { hintType: 'number', number: selectedNumber });
        if (redundant) {
          for (const touchedId of touchedCardIds) {
            triggerCardFx(touchedId, 'hint-redundant');
          }
          return;
        }

        commitLocal(() => {
          debugGame.giveNumberHint(playerId, selectedNumber);
        });
      }
      return;
    }

    if (!activeGameState || !onlineState.selfId || !pendingAction) {
      return;
    }

    const actorId = onlineState.selfId;
    const currentPlayer = activeGameState.players[activeGameState.currentTurnPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== actorId) {
      return;
    }

    const selectedCard = activeGameState.cards[cardId];
    if (!selectedCard) {
      return;
    }

    let action: NetworkAction | null = null;
    if (pendingAction === 'play') {
      if (playerId !== actorId) {
        return;
      }

      action = {
        type: 'play',
        actorId,
        cardId
      };
    }

    if (pendingAction === 'discard') {
      if (playerId !== actorId) {
        return;
      }

      action = {
        type: 'discard',
        actorId,
        cardId
      };
    }

    if (pendingAction === 'hint-color') {
      if (playerId === actorId) {
        return;
      }

      if (activeGameState.settings.multicolorWildHints && selectedCard.suit === 'M') {
        setWildColorHintTargetPlayerId(playerId);
        return;
      }

      const { redundant, touchedCardIds } = isRedundantHint(activeGameState, playerId, { hintType: 'color', suit: selectedCard.suit });
      if (redundant) {
        for (const touchedId of touchedCardIds) {
          triggerCardFx(touchedId, 'hint-redundant');
        }
        return;
      }

      action = {
        type: 'hint-color',
        actorId,
        targetPlayerId: playerId,
        suit: selectedCard.suit
      };
    }

    if (pendingAction === 'hint-number') {
      if (playerId === actorId) {
        return;
      }

      const { redundant, touchedCardIds } = isRedundantHint(activeGameState, playerId, { hintType: 'number', number: selectedCard.number });
      if (redundant) {
        for (const touchedId of touchedCardIds) {
          triggerCardFx(touchedId, 'hint-redundant');
        }
        return;
      }

      action = {
        type: 'hint-number',
        actorId,
        targetPlayerId: playerId,
        number: selectedCard.number
      };
    }

    if (!action) {
      return;
    }

    activeSession.sendAction(action);
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);
  }

  function cancelWildColorPicker(): void {
    setWildColorHintTargetPlayerId(null);
    if (isLocalDebugMode) {
      commitLocal(() => {
        debugGame.cancelSelection();
      });
      return;
    }

    setPendingAction(null);
  }

  function handleWildColorPick(suit: Suit): void {
    const targetPlayerId = wildColorHintTargetPlayerId;
    if (!targetPlayerId) {
      return;
    }

    if (suit === 'M') {
      return;
    }

    if (isLocalDebugMode) {
      const { redundant, touchedCardIds } = isRedundantHint(debugGame.state, targetPlayerId, { hintType: 'color', suit });
      if (redundant) {
        for (const touchedId of touchedCardIds) {
          triggerCardFx(touchedId, 'hint-redundant');
        }
        return;
      }

      commitLocal(() => {
        debugGame.giveColorHint(targetPlayerId, suit);
      });
      setWildColorHintTargetPlayerId(null);
      return;
    }

    if (!activeGameState || !onlineState.selfId) {
      return;
    }

    const actorId = onlineState.selfId;
    const currentPlayer = activeGameState.players[activeGameState.currentTurnPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== actorId) {
      setPendingAction(null);
      setWildColorHintTargetPlayerId(null);
      return;
    }

    const { redundant, touchedCardIds } = isRedundantHint(activeGameState, targetPlayerId, { hintType: 'color', suit });
    if (redundant) {
      for (const touchedId of touchedCardIds) {
        triggerCardFx(touchedId, 'hint-redundant');
      }
      return;
    }

    activeSession.sendAction({
      type: 'hint-color',
      actorId,
      targetPlayerId,
      suit
    });
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);
  }

  function openLogDrawer(): void {
    if (isLogDrawerOpen) return;
    setIsMenuOpen(false);
    setIsLeaveGameArmed(false);

    if (logDrawerCloseTimeoutRef.current !== null) {
      window.clearTimeout(logDrawerCloseTimeoutRef.current);
      logDrawerCloseTimeoutRef.current = null;
    }

    const token = logDrawerTokenRef.current + 1;
    logDrawerTokenRef.current = token;
    setIsLogDrawerMounted(true);

    const scheduleOpen = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0);

    scheduleOpen(() => {
      if (logDrawerTokenRef.current !== token) {
        return;
      }

      setIsLogDrawerOpen(true);
    });
  }

  function closeLogDrawer(): void {
    if (!isLogDrawerMounted) return;
    logDrawerTokenRef.current += 1;
    setIsLogDrawerOpen(false);

    if (logDrawerCloseTimeoutRef.current !== null) {
      window.clearTimeout(logDrawerCloseTimeoutRef.current);
    }

    logDrawerCloseTimeoutRef.current = window.setTimeout(() => {
      logDrawerCloseTimeoutRef.current = null;
      setIsLogDrawerMounted(false);
    }, 280);
  }

  function toggleMenu(): void {
    if (isLogDrawerMounted) {
      closeLogDrawer();
    }

    setIsMenuOpen((current) => {
      const next = !current;
      if (!next) {
        setIsLeaveGameArmed(false);
      }
      return next;
    });
  }

  function closeMenu(): void {
    if (!isMenuOpen) return;
    setIsMenuOpen(false);
    setIsLeaveGameArmed(false);
  }

  function handleLocalDebugToggle(): void {
    if (isDebugNetworkFrame) {
      return;
    }

    setIsLeaveGameArmed(false);
    setIsMenuOpen(false);
    closeLogDrawer();
    setPendingAction(null);

    const next = !isDebugMode;
    if (next) {
      const snapshot = onlineState.gameState;
      if (snapshot) {
        try {
          debugGame.replaceState(snapshot);
          setDebugGameState(debugGame.getSnapshot());
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown debug state error';
          window.alert(`Unable to enable local debug mode: ${message}`);
          return;
        }
      }
    } else {
      debugGame.cancelSelection();
      setDebugGameState(debugGame.getSnapshot());
    }

    setIsDebugMode(next);
  }

  function handleLeaveGamePress(): void {
    if (!isLeaveGameArmed) {
      setIsLeaveGameArmed(true);
      return;
    }

    setIsLeaveGameArmed(false);
    setIsMenuOpen(false);
    closeLogDrawer();
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);

    if (typeof window === 'undefined') {
      return;
    }

    if (isLocalDebugMode) {
      debugGame.cancelSelection();
      setDebugGameState(debugGame.getSnapshot());
      setIsDebugMode(false);
      return;
    }

    window.location.hash = '';
    window.location.reload();
  }

  function handleEnableDebugMode(): void {
    if (isDebugNetworkFrame) {
      return;
    }

    setIsLeaveGameArmed(false);
    setIsDebugMode(true);
  }

  function handleOpenDebugNetworkShell(): void {
    if (isDebugNetworkFrame || !onOpenDebugNetworkShell) {
      return;
    }

    setIsLeaveGameArmed(false);
    setIsMenuOpen(false);
    onOpenDebugNetworkShell();
  }

  function handleNegativeColorHintsToggle(): void {
    setIsLeaveGameArmed(false);
    setShowNegativeColorHints((current) => !current);
    setIsMenuOpen(false);
  }

  function handleNegativeNumberHintsToggle(): void {
    setIsLeaveGameArmed(false);
    setShowNegativeNumberHints((current) => !current);
    setIsMenuOpen(false);
  }

  function handleDarkModeToggle(): void {
    setIsLeaveGameArmed(false);
    onToggleDarkMode();
    setIsMenuOpen(false);
  }

  function handleReconnectPress(): void {
    setIsLeaveGameArmed(false);
    activeSession.requestSync();
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);
    setIsMenuOpen(false);
  }

  async function handleCopyStatePress(): Promise<void> {
    setIsMenuOpen(false);
    if (!activeGameState) {
      window.alert('No game state available yet.');
      return;
    }

    try {
      await writeToClipboard(JSON.stringify(activeGameState));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown clipboard error';
      window.alert(`Unable to copy game state: ${message}`);
    }
  }

  async function handleLoadStatePress(): Promise<void> {
    if (isDebugNetworkFrame) {
      return;
    }

    setIsMenuOpen(false);
    closeLogDrawer();
    setPendingAction(null);

    let loaded: HanabiState | null = null;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText.trim().length > 0) {
          loaded = parseHanabiStatePayload(clipboardText.trim());
        }
      } catch {
        loaded = null;
      }
    }

    if (!loaded) {
      const raw = window.prompt('Paste a Hanabi game state JSON (from "Debug: copy state")');
      if (!raw || raw.trim().length === 0) {
        return;
      }

      try {
        loaded = parseHanabiStatePayload(raw.trim());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown load error';
        window.alert(`Unable to load game state: ${message}`);
        return;
      }
    }

    try {
      debugGame.replaceState(loaded);
      setDebugGameState(debugGame.getSnapshot());
      setIsDebugMode(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown debug state error';
      window.alert(`Unable to apply game state: ${message}`);
    }
  }

  if (showLobby) {
    return (
      <LobbyScreen
        roomId={roomId}
        status={onlineState.status}
        error={onlineState.error}
        members={onlineState.members}
        hostId={onlineState.hostId}
        isHost={onlineState.isHost}
        selfId={onlineState.selfId}
        selfName={playerName}
        onSelfNameChange={setPlayerName}
        selfIsTv={isTvMode}
        onSelfIsTvChange={setIsTvMode}
        phase={onlineState.phase}
        settings={onlineState.settings}
        isGameInProgress={onlineState.phase === 'playing' && !isOnlineParticipant}
        onStart={activeSession.startGame}
        onReconnect={activeSession.requestSync}
        onLeaveRoom={onLeaveRoom}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        onEnableDebugMode={isDebugNetworkFrame ? null : handleEnableDebugMode}
        onEnableDebugNetwork={isDebugNetworkFrame ? null : handleOpenDebugNetworkShell}
        onUpdateSettings={activeSession.updateSettings}
      />
    );
  }

  if (showTv && activeGameState) {
    return (
      <TvScreen
        gameState={activeGameState}
        discardCounts={discardCounts}
        status={onlineState.status}
        error={onlineState.error}
        onReconnect={activeSession.requestSync}
        showNegativeColorHints={showNegativeColorHints}
        showNegativeNumberHints={showNegativeNumberHints}
      />
    );
  }

  if (!activeGameState || !perspective) {
    return (
      <LobbyWaitingForSnapshot
        roomId={roomId}
        onReconnect={activeSession.requestSync}
        onLeaveRoom={onLeaveRoom}
      />
    );
  }

  const effectiveTurnPlayerId = isActionAnimationRunning && turnLockPlayerId
    ? turnLockPlayerId
    : perspective.currentTurnPlayerId;
  const effectivePlayers = perspective.players.map((player) => ({
    ...player,
    isCurrentTurn: player.id === effectiveTurnPlayerId
  }));

  const others = effectivePlayers.filter((player) => player.id !== perspective.viewerId);
  const viewer = effectivePlayers.find((player) => player.id === perspective.viewerId);
  if (!viewer) {
    throw new Error(`Missing viewer ${perspective.viewerId}`);
  }

  const tablePlayers = [...others, viewer];
  const activeTurnIndex = tablePlayers.findIndex((player) => player.id === effectiveTurnPlayerId);
  const isCompactPlayersLayout = tablePlayers.length >= 4;
  const lastLog = perspective.logs[perspective.logs.length - 1] ?? null;
  const orderedLogs = [...perspective.logs].reverse();
  const hintTokenStates = Array.from({ length: perspective.maxHintTokens }, (_, index) => index < perspective.hintTokens);
  const remainingFuses = perspective.maxFuseTokens - perspective.fuseTokensUsed;
  const fuseTokenStates = Array.from({ length: perspective.maxFuseTokens }, (_, index) => index < remainingFuses);
  const gameOver = isTerminalStatus(perspective.status);
  const endgameOutcome: 'win' | 'lose' = perspective.status === 'won' ? 'win' : 'lose';
  const showEndgameOverlay = gameOver && !isActionAnimationRunning;
  const reduceMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isOnlineTurn = !isLocalDebugMode && onlineState.selfId !== null && perspective.currentTurnPlayerId === onlineState.selfId;
  const canAct = (isLocalDebugMode || (onlineState.status === 'connected' && isOnlineTurn)) && !isActionAnimationRunning;
  const selectedAction: PendingCardAction = isLocalDebugMode ? debugGame.state.ui.pendingAction : pendingAction;
  const showReconnectAction = !isLocalDebugMode && onlineState.status !== 'connected';
  const discardDisabled = gameOver || !canAct || perspective.hintTokens >= perspective.maxHintTokens;
  const colorHintDisabled = gameOver || !canAct || perspective.hintTokens <= 0;
  const numberHintDisabled = gameOver || !canAct || perspective.hintTokens <= 0;
  const playDisabled = gameOver || !canAct;

  function toggleEndgameLog(): void {
    setEndgamePanel((current) => (current === 'log' ? 'summary' : 'log'));
  }

  function backToStart(): void {
    setEndgamePanel('summary');
    setIsMenuOpen(false);
    closeLogDrawer();
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);

    if (isLocalDebugMode) {
      debugGame.replaceState(new HanabiGame(LOCAL_DEBUG_SETUP).getSnapshot());
      setDebugGameState(debugGame.getSnapshot());
      return;
    }

    if (onlineState.isHost) {
      activeSession.updateSettings({});
      return;
    }

    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  return (
    <main className="app" data-testid="app-root">
      <section className="stats">
        <div className="stat hints-stat" data-testid="status-hints">
          <div className="token-grid hints-grid" aria-label="Hint tokens">
            {hintTokenStates.map((isFilled, index) => (
              <span
                key={`hint-token-${index}`}
                className="token-slot"
                ref={(node) => {
                  hintTokenSlotRefs.current[index] = node;
                }}
                data-testid={`hint-token-${index}`}
              >
                <LightbulbFilament
                  size={15}
                  weight={isFilled ? 'fill' : 'regular'}
                  className={isFilled ? 'token-icon filled' : 'token-icon hollow'}
                />
              </span>
            ))}
          </div>
          <span className="visually-hidden" data-testid="status-hints-count">{perspective.hintTokens}</span>
        </div>

        <div className="stat deck-stat" data-testid="status-deck">
          <div className="deck-pill" ref={deckPillRef} data-testid="deck-pill">
            <CardsThree size={17} weight="fill" />
            <DeckCount value={perspective.drawDeckCount} />
          </div>
        </div>

        <div className="stat fuses-stat" data-testid="status-fuses">
          <div className="token-grid fuses-grid" aria-label="Fuse tokens">
            {fuseTokenStates.map((isFilled, index) => (
              <span
                key={`fuse-token-${index}`}
                className="token-slot"
                ref={(node) => {
                  fuseTokenSlotRefs.current[index] = node;
                }}
                data-testid={`fuse-token-${index}`}
              >
                <Fire
                  size={24}
                  weight={isFilled ? 'fill' : 'regular'}
                  className={isFilled ? 'token-icon filled danger' : 'token-icon hollow danger'}
                />
              </span>
            ))}
          </div>
          <span className="visually-hidden" data-testid="status-fuses-count">{remainingFuses}</span>
        </div>
      </section>

      <section
        className="fireworks"
        style={{ '--suit-count': String(perspective.activeSuits.length) } as CSSProperties}
        data-testid="fireworks-grid"
      >
        {perspective.activeSuits.map((suit) => {
          const height = perspective.fireworksHeights[suit];
          return (
            <div key={suit} className="tower" style={{ '--suit': suitColors[suit] } as CSSProperties} data-testid={`tower-${suit}`}>
              <div className="tower-stack">
                {CARD_NUMBERS.map((num) => {
                  const isLit = num <= height;
                  const remaining = perspective.knownRemainingCounts[suit][num];
                  const knownUnavailable = perspective.knownUnavailableCounts[suit][num];
                  const totalCopies = remaining + knownUnavailable;
                  const discarded = discardCounts.get(`${suit}-${num}`) ?? 0;
                  const blocked = num > height && discarded >= totalCopies;
                  const pipStates = getPegPipStates(remaining, totalCopies);

                  return (
                    <div
                      key={num}
                      className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}
                      data-testid={`peg-${suit}-${num}`}
                    >
                      <span className="peg-num">{blocked ? '✕' : num}</span>
                      <span className="peg-pips" aria-label={`${remaining} copies not visible to you`}>
                        <PegPips pipStates={pipStates} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

		      <section
		        className={`table-shell ${isCompactPlayersLayout ? 'compact' : ''}`}
		        style={{ '--player-count': String(tablePlayers.length), '--active-index': String(activeTurnIndex) } as CSSProperties}
		        data-testid="table-shell"
		      >
		        {activeTurnIndex >= 0 && <div className="turn-indicator" aria-hidden data-testid="turn-indicator" />}
		        {tablePlayers.map((player) => (
	          <article
	            key={player.id}
	            className={`player ${player.isCurrentTurn ? 'active' : ''} ${player.isViewer ? 'you-player' : ''}`}
	            data-testid={`player-${player.id}`}
          >
	            <header className="player-header">
	              <span className="player-name" data-testid={`player-name-${player.id}`}>
	                {player.isViewer && !isCompactPlayersLayout ? `${player.name} (You)` : player.name}
	              </span>
	              {player.isCurrentTurn && (
	                <span className="turn-chip" data-testid={`player-turn-${player.id}`}>
	                  <span className="turn-chip-dot" />
	                  Turn
	                </span>
	              )}
	            </header>
	            <div className="cards" style={{ '--hand-size': String(player.cards.length) } as CSSProperties}>
	              {player.cards.map((card, cardIndex) => (
	                <CardView
	                  key={card.id}
                  card={card}
                  showNegativeColorHints={showNegativeColorHints}
                  showNegativeNumberHints={showNegativeNumberHints}
                  onSelect={() => handleCardSelect(player.id, card.id)}
                  testId={`card-${player.id}-${cardIndex}`}
                  onNode={(node) => {
                    if (node) {
                      cardNodeByIdRef.current.set(card.id, node);
                    } else {
                      cardNodeByIdRef.current.delete(card.id);
                    }
                  }}
                />
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="bottom-panel">
        <button type="button" className="last-action" onClick={openLogDrawer} data-testid="status-last-action">
          <span className="last-action-label">Last</span>
          <LastActionTicker
            id={lastLog?.id ?? 'none'}
            message={lastLog ? renderLogMessage(lastLog) : 'No actions yet'}
          />
        </button>

        <section className="actions">
          <div className="action-slot">
            <button
              type="button"
              className={`action-button danger ${selectedAction === 'discard' ? 'selected' : ''}`}
              data-testid="actions-discard"
              onClick={handleDiscardPress}
              disabled={discardDisabled}
            >
              <span className="action-main">Discard</span>
            </button>
          </div>

          <div className="action-slot">
            <button
              type="button"
              className={`action-button ${selectedAction === 'hint-number' ? 'selected' : ''}`}
              data-testid="actions-number"
              onClick={handleHintNumberPress}
              disabled={numberHintDisabled}
            >
	              <span className="action-main">Number</span>
	            </button>
	          </div>
	
	          <div className="action-slot">
	            <button
	              type="button"
	              className="action-button menu-toggle"
	              aria-label="Open menu"
	              aria-expanded={isMenuOpen}
	              data-testid="actions-menu"
	              onClick={toggleMenu}
	            >
	              <span />
	              <span />
	              <span />
	            </button>
	          </div>

          <div className="action-slot">
            <button
              type="button"
              className={`action-button ${selectedAction === 'hint-color' ? 'selected' : ''}`}
              data-testid="actions-color"
              onClick={handleHintColorPress}
              disabled={colorHintDisabled}
            >
              <span className="action-main">Color</span>
            </button>
          </div>

          <div className="action-slot">
            <button
              type="button"
              className={`action-button primary ${selectedAction === 'play' ? 'selected' : ''}`}
              data-testid="actions-play"
              onClick={handlePlayPress}
              disabled={playDisabled}
            >
              <span className="action-main">Play</span>
            </button>
          </div>
        </section>
      </section>

      {wildColorHintTargetPlayerId && (
        <aside className="wild-color-picker" data-testid="wild-color-picker">
          <div className="wild-color-picker-buttons">
            {BASE_SUITS.map((suit) => (
              <button
                key={suit}
                type="button"
                className="wild-color-button"
                style={{ '--suit': suitColors[suit] } as CSSProperties}
                onClick={() => handleWildColorPick(suit)}
                aria-label={`Hint ${suitNames[suit]}`}
                data-testid={`wild-color-${suit}`}
              >
                {suit}
              </button>
            ))}
            <button
              type="button"
              className="wild-color-cancel"
              onClick={cancelWildColorPicker}
              aria-label="Cancel"
              data-testid="wild-color-cancel"
            >
              X
            </button>
          </div>
        </aside>
      )}

      <>
        <button
          type="button"
          className={`menu-scrim ${isMenuOpen ? 'open' : ''}`}
          aria-label="Close menu"
          aria-hidden={!isMenuOpen}
          tabIndex={isMenuOpen ? 0 : -1}
          onClick={closeMenu}
        />

        <aside className={`menu-panel ${isMenuOpen ? 'open' : ''}`} aria-hidden={!isMenuOpen}>
          <button
            type="button"
            className={`menu-item menu-danger ${isLeaveGameArmed ? 'armed' : ''}`}
            data-testid="menu-leave-game"
            onClick={handleLeaveGamePress}
          >
            {isLeaveGameArmed ? 'Are you sure?' : 'Leave game'}
          </button>

          <section className="menu-section" aria-label="Configuration">
            <div className="menu-section-title">Config</div>
            <button
              type="button"
              className="menu-item menu-toggle-item"
              data-testid="menu-dark-mode-toggle"
              aria-pressed={isDarkMode}
              onClick={handleDarkModeToggle}
            >
              <span>Dark Mode</span>
              <span data-testid="menu-dark-mode-value">{isDarkMode ? 'On' : 'Off'}</span>
            </button>
            <button
              type="button"
              className="menu-item menu-toggle-item"
              data-testid="menu-negative-color-toggle"
              onClick={handleNegativeColorHintsToggle}
            >
              <span>Negative Color Hints</span>
              <span data-testid="menu-negative-color-value">{showNegativeColorHints ? 'On' : 'Off'}</span>
            </button>
            <button
              type="button"
              className="menu-item menu-toggle-item"
              data-testid="menu-negative-number-toggle"
              onClick={handleNegativeNumberHintsToggle}
            >
              <span>Negative Number Hints</span>
              <span data-testid="menu-negative-number-value">{showNegativeNumberHints ? 'On' : 'Off'}</span>
            </button>
            {!isLocalDebugMode && showReconnectAction && (
              <button
                type="button"
                className="menu-item"
                data-testid="menu-reconnect"
                onClick={handleReconnectPress}
              >
                Reconnect
              </button>
            )}
            {!isLocalDebugMode && !isDebugNetworkFrame && onLeaveRoom && (
              <button
                type="button"
                className="menu-item"
                data-testid="menu-leave-room"
                onClick={() => {
                  setIsMenuOpen(false);
                  onLeaveRoom();
                }}
              >
                Leave Room
              </button>
            )}
          </section>

          <section className="menu-section" aria-label="Debug">
            <div className="menu-section-title">Debug</div>
            {!isDebugNetworkFrame && (
              <button
                type="button"
                className="menu-item menu-toggle-item"
                data-testid="menu-local-debug-toggle"
                onClick={handleLocalDebugToggle}
              >
                <span>Local Debug</span>
                <span data-testid="menu-local-debug-value">{isLocalDebugMode ? 'On' : 'Off'}</span>
              </button>
            )}
            <button
              type="button"
              className="menu-item"
              data-testid="menu-debug-copy-state"
              onClick={() => void handleCopyStatePress()}
            >
              Debug: Copy State
            </button>
            {!isDebugNetworkFrame && (
              <button
                type="button"
                className="menu-item"
                data-testid="menu-debug-load-state"
                onClick={() => void handleLoadStatePress()}
              >
                Debug: Load State
              </button>
            )}
            {onOpenDebugNetworkShell && (
              <button
                type="button"
                className="menu-item"
                data-testid="menu-debug-network"
                onClick={handleOpenDebugNetworkShell}
              >
                Debug Network
              </button>
            )}
          </section>

          <a
            className="menu-item menu-link"
            data-testid="menu-view-github"
            href="https://github.com/smirea/hanabi"
            target="_blank"
            rel="noreferrer noopener"
          >
            View on GitHub
          </a>
        </aside>
      </>

      {isLogDrawerMounted && (
        <>
          <button
            type="button"
            className={`drawer-scrim ${isLogDrawerOpen ? 'open' : ''}`}
            aria-label="Close action log"
            aria-hidden={!isLogDrawerOpen}
            tabIndex={isLogDrawerOpen ? 0 : -1}
            onClick={closeLogDrawer}
          />

          <aside className={`log-drawer ${isLogDrawerOpen ? 'open' : ''}`} aria-hidden={!isLogDrawerOpen}>
            <header className="log-drawer-header">
              <span className="log-drawer-title">Action Log</span>
              <button
                type="button"
                className="log-drawer-close action-button"
                onClick={closeLogDrawer}
                data-testid="log-close"
              >
                Close
              </button>
            </header>
            <div ref={logListRef} className="log-list" data-testid="log-list">
              {orderedLogs.map((logEntry) => (
                <article key={logEntry.id} className="log-item" data-testid={`log-item-${logEntry.id}`}>
                  <span className={`log-kind ${logEntry.type}`}>{getLogBadge(logEntry)}</span>
                  <span className="log-item-message">{renderLogMessage(logEntry)}</span>
                </article>
              ))}
            </div>
          </aside>
        </>
      )}

      <div className="animation-layer" ref={animationLayerRef} aria-hidden data-testid="animation-layer" />

      {showEndgameOverlay && (
        <EndgameOverlay
          outcome={endgameOutcome}
          status={perspective.status}
          score={perspective.score}
          perspective={perspective}
          discardCounts={discardCounts}
          players={activeGameState.players}
          viewerId={perspective.viewerId}
          statsByPlayerId={endgameStatsByPlayerId}
          logs={orderedLogs}
          panel={endgamePanel}
          reduceMotion={reduceMotion}
          onToggleLog={toggleEndgameLog}
          onBackToStart={backToStart}
        />
      )}
    </main>
  );
}

function hashSeed(input: string): number {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function EndgameOverlay({
  outcome,
  status,
  score,
  perspective,
  discardCounts,
  players,
  viewerId,
  statsByPlayerId,
  logs,
  panel,
  reduceMotion,
  onToggleLog,
  onBackToStart
}: {
  outcome: 'win' | 'lose';
  status: HanabiPerspectiveState['status'];
  score: number;
  perspective: HanabiPerspectiveState;
  discardCounts: Map<string, number>;
  players: Array<{ id: PlayerId; name: string }>;
  viewerId: PlayerId;
  statsByPlayerId: Map<PlayerId, { hintsGiven: number; hintsReceived: number; plays: number; discards: number }>;
  logs: GameLogEntry[];
  panel: 'summary' | 'log';
  reduceMotion: boolean;
  onToggleLog: () => void;
  onBackToStart: () => void;
}) {
  const title = status === 'won'
    ? 'You win'
    : status === 'lost'
      ? 'You lost'
      : 'Game over';

  const scoreBreakdown = perspective.activeSuits.map((suit) => perspective.fireworksHeights[suit]);
  const scoreFormula = `${scoreBreakdown.join('+')} = ${score}`;
  const remainingLives = Math.max(0, perspective.maxFuseTokens - perspective.fuseTokensUsed);

  const seedKey = `${outcome}:${status}:${score}:${logs[0]?.id ?? 'none'}`;

  const confettiPieces = useMemo(() => {
    if (outcome !== 'win' || reduceMotion) {
      return [];
    }

	    const rand = mulberry32(hashSeed(seedKey));
	    const count = 78;
	    return Array.from({ length: count }, (_, index) => ({
	      key: `confetti-${index}`,
	      left: rand() * 100,
	      delay: rand() * 2.2,
	      duration: 3.2 + rand() * 3.8,
	      drift: (rand() - 0.5) * 220,
	      hue: Math.floor(rand() * 360),
	      size: 6 + rand() * 8,
	      radius: 1 + rand() * 6
	    }));
	  }, [outcome, reduceMotion, seedKey]);

  const rainIntroDrops = useMemo(() => {
    if (outcome !== 'lose' || reduceMotion) {
      return [];
    }

    const rand = mulberry32(hashSeed(seedKey) ^ 0x9E3779B9);
    const count = 110;
    return Array.from({ length: count }, (_, index) => ({
      key: `rain-intro-${index}`,
      left: rand() * 100,
      delay: rand() * 0.4,
      duration: 0.55 + rand() * 0.55,
      height: 22 + rand() * 44,
      opacity: 0.32 + rand() * 0.42,
      drift: (rand() - 0.5) * 30
    }));
  }, [outcome, reduceMotion, seedKey]);

  const rainLoopDrops = useMemo(() => {
    if (outcome !== 'lose' || reduceMotion) {
      return [];
    }

    const rand = mulberry32(hashSeed(seedKey) ^ 0xB7E15162);
    const count = 56;
    return Array.from({ length: count }, (_, index) => ({
      key: `rain-loop-${index}`,
      left: rand() * 100,
      delay: rand() * 1.2,
      duration: 0.92 + rand() * 0.82,
      height: 22 + rand() * 38,
      opacity: 0.16 + rand() * 0.22,
      drift: (rand() - 0.5) * 20
    }));
  }, [outcome, reduceMotion, seedKey]);

  return (
    <aside
      className={`endgame-overlay ${outcome}`}
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      data-testid="endgame-screen"
    >
      <div className={`endgame-fx ${outcome}`} aria-hidden>
        {outcome === 'win' && (
          <div className="endgame-confetti">
            {confettiPieces.map((piece) => (
              <span
                key={piece.key}
                className="endgame-confetti-piece"
                style={{
                  '--x': `${piece.left}%`,
                  '--delay': `${piece.delay}s`,
                  '--dur': `${piece.duration}s`,
                  '--drift': `${piece.drift}px`,
                  '--hue': String(piece.hue),
                  '--size': `${piece.size}px`,
                  '--radius': `${piece.radius}px`
                } as CSSProperties}
              />
            ))}
          </div>
        )}

        {outcome === 'lose' && (
          <>
            <div className="endgame-rain intro">
              {rainIntroDrops.map((drop) => (
                <span
                  key={drop.key}
                  className="endgame-rain-drop"
                  style={{
                    '--x': `${drop.left}%`,
                    '--delay': `${drop.delay}s`,
                    '--dur': `${drop.duration}s`,
                    '--h': `${drop.height}px`,
                    '--o': String(drop.opacity),
                    '--drift': `${drop.drift}px`
                  } as CSSProperties}
                />
              ))}
            </div>
            <div className="endgame-rain loop">
              {rainLoopDrops.map((drop) => (
                <span
                  key={drop.key}
                  className="endgame-rain-drop"
                  style={{
                    '--x': `${drop.left}%`,
                    '--delay': `${drop.delay}s`,
                    '--dur': `${drop.duration}s`,
                    '--h': `${drop.height}px`,
                    '--o': String(drop.opacity),
                    '--drift': `${drop.drift}px`
                  } as CSSProperties}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <section className="endgame-shell">
        <header className="endgame-header">
          <h2 className="endgame-title" data-testid="endgame-title">{title}</h2>
          <p className="endgame-score" data-testid="endgame-score">{scoreFormula}</p>
          <div className="endgame-resources" data-testid="endgame-resources">
            <div className="endgame-resource" data-testid="endgame-hints-remaining">
              <LightbulbFilament size={18} weight="fill" aria-hidden />
              <span>Hints</span>
              <span className="endgame-resource-value">{perspective.hintTokens}/{perspective.maxHintTokens}</span>
            </div>
            <div className="endgame-resource" data-testid="endgame-lives-remaining">
              <Fire size={18} weight="fill" aria-hidden />
              <span>Lives</span>
              <span className="endgame-resource-value">{remainingLives}/{perspective.maxFuseTokens}</span>
            </div>
          </div>
        </header>

        <section className="endgame-board" data-testid="endgame-board">
          <section
            className="fireworks endgame-fireworks"
            style={{ '--suit-count': String(perspective.activeSuits.length) } as CSSProperties}
            data-testid="endgame-fireworks-grid"
          >
            {perspective.activeSuits.map((suit) => {
              const height = perspective.fireworksHeights[suit];
              return (
                <div
                  key={suit}
                  className="tower"
                  style={{ '--suit': suitColors[suit] } as CSSProperties}
                  data-testid={`endgame-tower-${suit}`}
                >
                  <div className="tower-stack">
                    {CARD_NUMBERS.map((num) => {
                      const isLit = num <= height;
                      const remaining = perspective.knownRemainingCounts[suit][num];
                      const knownUnavailable = perspective.knownUnavailableCounts[suit][num];
                      const totalCopies = remaining + knownUnavailable;
                      const discarded = discardCounts.get(`${suit}-${num}`) ?? 0;
                      const blocked = num > height && discarded >= totalCopies;
                      const pipStates = getPegPipStates(remaining, totalCopies);

                      return (
                        <div
                          key={num}
                          className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}
                          data-testid={`endgame-peg-${suit}-${num}`}
                        >
                          <span className="peg-num">{blocked ? '✕' : num}</span>
                          <span className="peg-pips" aria-label={`${remaining} copies not visible to you`}>
                            <PegPips pipStates={pipStates} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        </section>

        <section className="endgame-panel" data-testid="endgame-panel">
          {panel === 'log' ? (
            <section className="endgame-log" data-testid="endgame-log">
              <h3 className="endgame-log-title">Action Log</h3>
              <div className="endgame-log-list">
                {logs.map((logEntry) => (
                  <article key={logEntry.id} className="log-item" data-testid={`endgame-log-${logEntry.id}`}>
                    <span className={`log-kind ${logEntry.type}`}>{getLogBadge(logEntry)}</span>
                    <span className="log-item-message">{renderLogMessage(logEntry)}</span>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="endgame-stats" data-testid="endgame-stats">
              <table className="endgame-table" data-testid="endgame-stats-table">
                <colgroup>
                  <col className="col-name" />
                  <col className="col-num" />
                  <col className="col-num" />
                  <col className="col-num" />
                  <col className="col-num" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">name</th>
                    <th scope="col" className="num">given</th>
                    <th scope="col" className="num">received</th>
                    <th scope="col" className="num">played</th>
                    <th scope="col" className="num">discard</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const stats = statsByPlayerId.get(player.id) ?? { hintsGiven: 0, hintsReceived: 0, plays: 0, discards: 0 };
                    const isViewer = player.id === viewerId;
                    return (
                      <tr
                        key={player.id}
                        className={isViewer ? 'you' : undefined}
                        data-testid={`endgame-player-${player.id}`}
                      >
                        <td className="name" data-testid={`endgame-player-name-${player.id}`}>
                          {player.name}
                          {isViewer ? <span className="you-tag">you</span> : null}
                        </td>
                        <td className="num" data-testid={`endgame-hints-given-${player.id}`}>{stats.hintsGiven}</td>
                        <td className="num" data-testid={`endgame-hints-received-${player.id}`}>{stats.hintsReceived}</td>
                        <td className="num" data-testid={`endgame-plays-${player.id}`}>{stats.plays}</td>
                        <td className="num" data-testid={`endgame-discards-${player.id}`}>{stats.discards}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </section>

        <footer className="endgame-actions">
          <button
            type="button"
            className="endgame-button subtle"
            onClick={onToggleLog}
            data-testid="endgame-view-log"
          >
            {panel === 'log' ? 'Hide Log' : 'View Log'}
          </button>
          <button
            type="button"
            className="endgame-button primary"
            onClick={onBackToStart}
            data-testid="endgame-back-start"
          >
            Back to Start
          </button>
        </footer>
      </section>
    </aside>
  );
}

function LobbyScreen({
  roomId,
  status,
  error,
  members,
  hostId,
  isHost,
  selfId,
  selfName,
  onSelfNameChange,
  selfIsTv,
  onSelfIsTvChange,
  phase,
  settings,
  isGameInProgress,
  onStart,
  onReconnect,
  onLeaveRoom,
  isDarkMode,
  onToggleDarkMode,
  onEnableDebugMode,
  onEnableDebugNetwork,
  onUpdateSettings
}: {
  roomId: string;
  status: OnlineState['status'];
  error: string | null;
  members: RoomMember[];
  hostId: string | null;
  isHost: boolean;
  selfId: string | null;
  selfName: string;
  onSelfNameChange: (next: string) => void;
  selfIsTv: boolean;
  onSelfIsTvChange: (next: boolean) => void;
  phase: 'lobby' | 'playing';
  settings: LobbySettings;
  isGameInProgress: boolean;
  onStart: () => void;
  onReconnect: () => void;
  onLeaveRoom: (() => void) | null;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onEnableDebugMode: (() => void) | null;
  onEnableDebugNetwork: (() => void) | null;
  onUpdateSettings: (next: Partial<LobbySettings>) => void;
}) {
  const effectiveMembers = selfId
    ? members.map((member) => (member.peerId === selfId ? { ...member, isTv: selfIsTv } : member))
    : members;
  const seatedCount = effectiveMembers.filter((member) => !member.isTv).length;
  const tvCount = effectiveMembers.length - seatedCount;
  const host = effectiveMembers.find((member) => member.peerId === hostId) ?? null;
  const canStart = phase === 'lobby' && seatedCount >= 2 && seatedCount <= 5;
  const showReconnect = status !== 'connected' || error !== null;
  const playerCountError = seatedCount > 5 ? 'Max 5 players' : (seatedCount < 2 ? 'Need at least 2 players' : null);
  const handSize = seatedCount <= 3 ? 5 : 4;
  const deckSize = 50 + (settings.includeMulticolor ? (settings.multicolorShortDeck ? 5 : 10) : 0);
  const maxScore = (settings.includeMulticolor ? 6 : 5) * 5;
  const defaultNamePlaceholder = selfId ? `Player ${selfId.slice(-4).toUpperCase()}` : 'Player';
  const [isConfigMenuOpen, setIsConfigMenuOpen] = useState(false);
  const configMenuRef = useRef<HTMLDivElement | null>(null);
  const hasDebugActions = Boolean(onEnableDebugMode || onEnableDebugNetwork);

  useEffect(() => {
    if (!isConfigMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      const menuNode = configMenuRef.current;
      if (!menuNode) {
        setIsConfigMenuOpen(false);
        return;
      }

      if (!menuNode.contains(event.target as Node)) {
        setIsConfigMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsConfigMenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isConfigMenuOpen]);

  function handleConfigAction(action: () => void): void {
    setIsConfigMenuOpen(false);
    action();
  }
  const configRows = [
    {
      id: 'extra-suit',
      label: 'Extra suit (M)',
      subtitle: 'Adds the multicolor suit (M) to the deck and fireworks.',
      value: settings.includeMulticolor ? 'On' : 'Off',
      disabled: false,
      onClick: () => {
        const nextIncludeMulticolor = !settings.includeMulticolor;
        onUpdateSettings({
          includeMulticolor: nextIncludeMulticolor,
          multicolorShortDeck: nextIncludeMulticolor ? settings.multicolorShortDeck : false,
          multicolorWildHints: nextIncludeMulticolor ? settings.multicolorWildHints : false
        });
      }
    },
    {
      id: 'short-deck',
      label: 'Multicolor short deck',
      subtitle: 'Uses 5 multicolor cards instead of the full 10.',
      value: settings.multicolorShortDeck ? 'On' : 'Off',
      disabled: !settings.includeMulticolor,
      onClick: () => onUpdateSettings({
        multicolorShortDeck: !settings.multicolorShortDeck,
        multicolorWildHints: false
      })
    },
    {
      id: 'wild-multicolor',
      label: 'Wild multicolor hints',
      subtitle: 'Color hints can point at any multicolor card (M).',
      value: settings.multicolorWildHints ? 'On' : 'Off',
      disabled: !settings.includeMulticolor,
      onClick: () => onUpdateSettings({
        multicolorWildHints: !settings.multicolorWildHints,
        multicolorShortDeck: false
      })
    },
    {
      id: 'endless',
      label: 'Endless mode',
      subtitle: 'Keep playing after the deck runs out.',
      value: settings.endlessMode ? 'On' : 'Off',
      disabled: false,
      onClick: () => onUpdateSettings({ endlessMode: !settings.endlessMode })
    }
  ] as const;

  return (
    <main className="app lobby-app" data-testid="lobby-root">
      <section className="lobby-shell-body">
        <section className="lobby-card">
        <div className="lobby-summary">
          <header className="lobby-header">
            <div className="lobby-header-start">
              <div className="lobby-config-menu" ref={configMenuRef}>
                <button
                  type="button"
                  className="lobby-button subtle lobby-config-toggle"
                  aria-haspopup="menu"
                  aria-expanded={isConfigMenuOpen}
                  aria-label="Open lobby settings"
                  onClick={() => setIsConfigMenuOpen((open) => !open)}
                  data-testid="lobby-config-toggle"
                >
                  <GearSix size={16} weight="bold" aria-hidden />
                </button>
                {isConfigMenuOpen && (
                  <div className="lobby-config-dropdown" role="menu" data-testid="lobby-config-dropdown">
                    <button
                      type="button"
                      className="lobby-config-dropdown-item"
                      onClick={() => handleConfigAction(onToggleDarkMode)}
                      role="menuitem"
                      data-testid="lobby-theme-toggle"
                    >
                      <span>Dark mode</span>
                      <span>{isDarkMode ? 'On' : 'Off'}</span>
                    </button>
                    {hasDebugActions && (
                      <div className="lobby-config-divider" role="separator" />
                    )}
                    {onEnableDebugMode && (
                      <button
                        type="button"
                        className="lobby-config-dropdown-item"
                        onClick={() => handleConfigAction(onEnableDebugMode)}
                        role="menuitem"
                        data-testid="lobby-debug-mode"
                      >
                        Debug local
                      </button>
                    )}
                    {onEnableDebugNetwork && (
                      <button
                        type="button"
                        className="lobby-config-dropdown-item"
                        onClick={() => handleConfigAction(onEnableDebugNetwork)}
                        role="menuitem"
                        data-testid="lobby-debug-network"
                      >
                        Debug network
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="lobby-header-actions">
              {onLeaveRoom && (
                <button
                  type="button"
                  className="lobby-button primary"
                  onClick={onLeaveRoom}
                  data-testid="lobby-leave-room"
                >
                  Leave
                </button>
              )}
            </div>
          </header>

          <div className="lobby-identity-grid" data-testid="lobby-identity-grid">
            <div className="lobby-identity-field">
              <label className="lobby-identity-label" htmlFor="lobby-name-input">Name</label>
              <input
                id="lobby-name-input"
                className="lobby-name-input"
                value={selfName}
                onChange={(event) => onSelfNameChange(event.target.value)}
                placeholder={defaultNamePlaceholder}
                maxLength={24}
                autoComplete="nickname"
                spellCheck={false}
                data-testid="lobby-name-input"
              />
            </div>
            <div className="lobby-identity-field">
              <span className="lobby-identity-label">Room</span>
              <p className="lobby-room-code" data-testid="lobby-room-code">{roomId}</p>
            </div>
          </div>

          {error && (
            <p className="lobby-note error" data-testid="lobby-error">
              {error}
            </p>
          )}

          {isGameInProgress && (
            <p className="lobby-note warning" data-testid="lobby-game-progress">
              Game in progress. You will join next round from this room.
            </p>
          )}
        </div>

        <section className="lobby-players">
          <h2 className="lobby-section-title">
            Players ({seatedCount}){tvCount > 0 ? ` + TVs (${tvCount})` : ''}
          </h2>
          <div className="lobby-player-list">
            {effectiveMembers.map((member) => (
              <article
                key={member.peerId}
                className={`lobby-player${member.peerId === selfId ? ' self' : ''}`}
                data-testid={`lobby-player-${member.peerId}`}
              >
                <div>
                  <div className="lobby-player-name">{member.name}</div>
                </div>
                <div className="lobby-chip-row">
                  {member.peerId === hostId && <span className="lobby-chip host">Host</span>}
                  {member.isTv && member.peerId !== selfId && <span className="lobby-chip tv">TV</span>}
                  {member.peerId === selfId && (
                    <button
                      type="button"
                      className={`lobby-tv-toggle ${selfIsTv ? 'on' : 'off'}`}
                      onClick={() => onSelfIsTvChange(!selfIsTv)}
                      aria-pressed={selfIsTv}
                      aria-label={selfIsTv ? 'Disable TV mode' : 'Enable TV mode'}
                      data-testid="lobby-tv-toggle"
                    >
                      TV
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lobby-settings">
          <h2 className="lobby-section-title">Configuration</h2>
          {isHost && phase === 'lobby' ? (
            <div className="lobby-toggle-list">
              {configRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="lobby-setting-toggle"
                  onClick={row.onClick}
                  disabled={row.disabled}
                  data-testid={`lobby-setting-${row.id}`}
                >
                  <span className="lobby-setting-text">
                    <span className="lobby-setting-label">{row.label}</span>
                    <span className="lobby-setting-subtitle">{row.subtitle}</span>
                  </span>
                  <span className="lobby-setting-value">{row.value}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="lobby-toggle-list" data-testid="lobby-settings-readonly">
              {configRows.map((row) => (
                <div key={row.id} className="lobby-setting-toggle readonly" aria-disabled="true">
                  <span className="lobby-setting-text">
                    <span className="lobby-setting-label">{row.label}</span>
                    <span className="lobby-setting-subtitle">{row.subtitle}</span>
                  </span>
                  <span className="lobby-setting-value">{row.value}</span>
                </div>
              ))}
            </div>
          )}
          <ul className="lobby-settings-list" data-testid="lobby-settings-derived">
            <li>Hand size: {handSize}</li>
            <li>Deck size: {deckSize}</li>
            <li>Max score: {maxScore}</li>
          </ul>
        </section>

        {playerCountError && isHost && phase === 'lobby' && (
          <p className="lobby-note warning" data-testid="lobby-player-count-warning">
            {playerCountError}
          </p>
        )}

        <section className="lobby-actions">
          {showReconnect && (
            <button type="button" className="lobby-button" onClick={onReconnect} data-testid="lobby-reconnect">
              Reconnect
            </button>
          )}
          {isHost && phase === 'lobby' ? (
            <button type="button" className="lobby-button primary" onClick={onStart} disabled={!canStart} data-testid="lobby-start">
              Start Game
            </button>
          ) : (
            <p className="lobby-waiting" data-testid="lobby-waiting-host">
              Waiting on {host?.name ?? 'host'} to start.
            </p>
          )}
        </section>
        </section>
      </section>
    </main>
  );
}

function LobbyWaitingForSnapshot({
  roomId,
  onReconnect,
  onLeaveRoom
}: {
  roomId: string;
  onReconnect: () => void;
  onLeaveRoom: (() => void) | null;
}) {
  return (
    <main className="app lobby-app" data-testid="lobby-root">
      <section className="lobby-shell-body">
        <section className="lobby-card lobby-card-compact">
          <p className="lobby-note warning">Waiting for room snapshot in room {roomId}.</p>
          <div className="room-wait-actions">
            <button
              type="button"
              className="lobby-button primary"
              onClick={onReconnect}
              data-testid="lobby-reconnect"
            >
              Reconnect
            </button>
            {onLeaveRoom && (
              <button
                type="button"
                className="lobby-button subtle"
                onClick={onLeaveRoom}
                data-testid="lobby-leave-room"
              >
                Leave
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function TvScreen({
  gameState,
  discardCounts,
  status,
  error,
  onReconnect,
  showNegativeColorHints,
  showNegativeNumberHints
}: {
  gameState: HanabiState;
  discardCounts: Map<string, number>;
  status: OnlineState['status'];
  error: string | null;
  onReconnect: () => void;
  showNegativeColorHints: boolean;
  showNegativeNumberHints: boolean;
}) {
  const activeSuits = gameState.settings.activeSuits;
  const currentTurnPlayer = gameState.players[gameState.currentTurnPlayerIndex] ?? null;
  const hintTokenStates = Array.from({ length: gameState.settings.maxHintTokens }, (_, index) => index < gameState.hintTokens);
  const remainingFuses = gameState.settings.maxFuseTokens - gameState.fuseTokensUsed;
  const fuseTokenStates = Array.from({ length: gameState.settings.maxFuseTokens }, (_, index) => index < remainingFuses);
  const score = activeSuits.reduce((sum, suit) => sum + gameState.fireworks[suit].length, 0);
  const orderedLogs = [...gameState.logs].reverse();
  const showReconnect = status !== 'connected' || error !== null;

  const { knownUnavailableCounts, knownRemainingCounts } = useMemo(() => {
    const copiesByNumber: Record<number, number> = {
      1: 3,
      2: 2,
      3: 2,
      4: 2,
      5: 1
    };

    const createEmptyCounts = (): Record<Suit, Record<number, number>> => {
      const counts = {} as Record<Suit, Record<number, number>>;
      for (const suit of activeSuits) {
        const byNumber: Record<number, number> = {};
        for (const number of CARD_NUMBERS) {
          byNumber[number] = 0;
        }
        counts[suit] = byNumber;
      }
      return counts;
    };

    const unavailable = createEmptyCounts();
    for (const cardId of gameState.discardPile) {
      const card = gameState.cards[cardId];
      if (!card || !unavailable[card.suit]) {
        continue;
      }

      unavailable[card.suit][card.number] = (unavailable[card.suit][card.number] ?? 0) + 1;
    }

    for (const suit of activeSuits) {
      for (const cardId of gameState.fireworks[suit]) {
        const card = gameState.cards[cardId];
        if (!card || !unavailable[card.suit]) {
          continue;
        }

        unavailable[card.suit][card.number] = (unavailable[card.suit][card.number] ?? 0) + 1;
      }
    }

    const remaining = createEmptyCounts();
    for (const suit of activeSuits) {
      for (const number of CARD_NUMBERS) {
        const totalCopies = suit === 'M' && gameState.settings.multicolorShortDeck
          ? 1
          : (copiesByNumber[number] ?? 0);
        remaining[suit][number] = Math.max(0, totalCopies - (unavailable[suit][number] ?? 0));
      }
    }

    return {
      knownUnavailableCounts: unavailable,
      knownRemainingCounts: remaining
    };
  }, [activeSuits, gameState.cards, gameState.discardPile, gameState.fireworks, gameState.settings.multicolorShortDeck]);

  const tvPlayers = useMemo(() => {
    const currentTurnPlayerId = currentTurnPlayer?.id ?? null;

    return gameState.players.map((player) => ({
      id: player.id,
      name: player.name,
      isCurrentTurn: player.id === currentTurnPlayerId,
      cards: player.cards.map((cardId) => {
        const card = gameState.cards[cardId];
        if (!card) {
          throw new Error(`Missing card ${cardId}`);
        }

        return {
          id: card.id,
          suit: null,
          number: null,
          hints: structuredClone(card.hints),
          isHiddenFromViewer: true
        } satisfies PerspectiveCard;
      })
    }));
  }, [currentTurnPlayer?.id, gameState.cards, gameState.players]);

  return (
    <main
      className="tv"
      style={{ '--hand-size': String(gameState.settings.handSize) } as CSSProperties}
      data-testid="tv-root"
    >
      <section className="tv-stage">
        <header className="tv-header">
          <div className="tv-header-title">
            <h1 className="tv-title" data-testid="tv-title">TV Mode</h1>
            <div className="tv-meta">
              <span className="tv-meta-item" data-testid="tv-score">Score {score}</span>
              <span className="tv-meta-item" data-testid="tv-turn">Turn {gameState.turn}</span>
              {currentTurnPlayer && (
                <span className="tv-meta-item" data-testid="tv-current-player">Turn: {currentTurnPlayer.name}</span>
              )}
            </div>
          </div>
          <div className={`tv-status ${gameState.status}`} data-testid="tv-status">
            {gameState.status.replace(/_/g, ' ')}
          </div>
        </header>

        <section className="stats tv-stats" data-testid="tv-stats">
          <div className="stat hints-stat" data-testid="tv-status-hints">
            <div className="token-grid hints-grid" aria-label="Hint tokens">
              {hintTokenStates.map((isFilled, index) => (
                <LightbulbFilament
                  key={`tv-hint-token-${index}`}
                  size={15}
                  weight={isFilled ? 'fill' : 'regular'}
                  className={isFilled ? 'token-icon filled' : 'token-icon hollow'}
                />
              ))}
            </div>
            <span className="visually-hidden" data-testid="tv-status-hints-count">{gameState.hintTokens}</span>
          </div>

          <div className="stat deck-stat" data-testid="tv-status-deck">
            <div className="deck-pill">
              <CardsThree size={17} weight="fill" />
              <span className="deck-count" data-testid="tv-status-deck-count">{gameState.drawDeck.length}</span>
            </div>
          </div>

          <div className="stat fuses-stat" data-testid="tv-status-fuses">
            <div className="token-grid fuses-grid" aria-label="Fuse tokens">
              {fuseTokenStates.map((isFilled, index) => (
                <Fire
                  key={`tv-fuse-token-${index}`}
                  size={24}
                  weight={isFilled ? 'fill' : 'regular'}
                  className={isFilled ? 'token-icon filled danger' : 'token-icon hollow danger'}
                />
              ))}
            </div>
            <span className="visually-hidden" data-testid="tv-status-fuses-count">{remainingFuses}</span>
          </div>
        </section>

        <section
          className="fireworks tv-fireworks"
          style={{ '--suit-count': String(activeSuits.length) } as CSSProperties}
          data-testid="tv-fireworks-grid"
        >
          {activeSuits.map((suit) => {
            const height = gameState.fireworks[suit].length;
            return (
              <div key={suit} className="tower" style={{ '--suit': suitColors[suit] } as CSSProperties} data-testid={`tv-tower-${suit}`}>
                <div className="tower-stack">
                  {CARD_NUMBERS.map((num) => {
                    const isLit = num <= height;
                    const remaining = knownRemainingCounts[suit]?.[num] ?? 0;
                    const knownUnavailable = knownUnavailableCounts[suit]?.[num] ?? 0;
                    const totalCopies = remaining + knownUnavailable;
                    const discarded = discardCounts.get(`${suit}-${num}`) ?? 0;
                    const blocked = num > height && discarded >= totalCopies;
                    const pipStates = getPegPipStates(remaining, totalCopies);

                    return (
                      <div
                        key={num}
                        className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}
                        data-testid={`tv-peg-${suit}-${num}`}
                      >
                        <span className="peg-num">{blocked ? '✕' : num}</span>
                        <span className="peg-pips" aria-label={`${remaining} copies not visible from TV`}>
                          <PegPips pipStates={pipStates} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <section className="tv-players" data-testid="tv-players">
          {tvPlayers.map((player) => (
            <article
              key={player.id}
              className={`tv-player ${player.isCurrentTurn ? 'active' : ''}`}
              data-testid={`tv-player-${player.id}`}
            >
              <header className="tv-player-header">
                <span className="tv-player-name" data-testid={`tv-player-name-${player.id}`}>
                  {player.name}
                </span>
                {player.isCurrentTurn && (
                  <span className="turn-chip" data-testid={`tv-player-turn-${player.id}`}>
                    <span className="turn-chip-dot" />
                    Turn
                  </span>
                )}
              </header>

              <div className="cards tv-cards">
                {player.cards.map((card, cardIndex) => (
                  <CardView
                    key={card.id}
                    card={card}
                    showNegativeColorHints={showNegativeColorHints}
                    showNegativeNumberHints={showNegativeNumberHints}
                    isDisabled
                    testId={`tv-card-${player.id}-${cardIndex}`}
                  />
                ))}
              </div>
            </article>
          ))}
        </section>
      </section>

      <aside className="tv-log" data-testid="tv-log">
        <header className="tv-log-header">
          <span className="tv-log-title">Action Log</span>
          {showReconnect && (
            <button type="button" className="tv-log-reconnect" onClick={onReconnect} data-testid="tv-reconnect">
              Reconnect
            </button>
          )}
        </header>
        {error && (
          <p className="tv-log-error" data-testid="tv-error">
            {error}
          </p>
        )}
        <div className="tv-log-list" data-testid="tv-log-list">
          {orderedLogs.map((logEntry) => (
            <article key={logEntry.id} className="log-item" data-testid={`tv-log-item-${logEntry.id}`}>
              <span className={`log-kind ${logEntry.type}`}>{getLogBadge(logEntry)}</span>
              <span className="log-item-message">{renderLogMessage(logEntry)}</span>
            </article>
          ))}
        </div>
      </aside>
    </main>
  );
}

function CardView({
  card,
  showNegativeColorHints,
  showNegativeNumberHints,
  onSelect,
  isDisabled = false,
  testId,
  onNode
}: {
  card: PerspectiveCard;
  showNegativeColorHints: boolean;
  showNegativeNumberHints: boolean;
  onSelect?: () => void;
  isDisabled?: boolean;
  testId: string;
  onNode?: (node: HTMLButtonElement | null) => void;
}) {
  const knownColor = card.hints.color;
  const knownNumber = card.hints.number;

  let faceSuit: Suit | null = null;
  let faceValue: string | number = '?';
  let bgColor: string | undefined;

  if (card.isHiddenFromViewer) {
    faceSuit = knownColor;
    faceValue = knownNumber ?? '?';
    bgColor = knownColor ? suitColors[knownColor] : (knownNumber ? '#9eb2d4' : undefined);
  } else {
    if (card.suit === null || card.number === null) {
      throw new Error(`Visible card ${card.id} is missing face values`);
    }

    faceSuit = card.suit;
    faceValue = card.number;
    bgColor = suitColors[card.suit];
  }

  const notColors = knownColor || !showNegativeColorHints ? [] : card.hints.notColors;
  const notNumbers = knownNumber || !showNegativeNumberHints ? [] : card.hints.notNumbers;
  const hasPositiveBadges = Boolean(knownColor || knownNumber);
  const hasNegativeBadges = notColors.length > 0 || notNumbers.length > 0;

  return (
    <button
      type="button"
      className={`card ${card.hints.recentlyHinted ? 'recent' : ''}`}
      style={{ '--card-bg': bgColor } as CSSProperties}
      onClick={isDisabled ? undefined : onSelect}
      data-testid={testId}
      data-card-id={card.id}
      ref={onNode}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-pressed={false}
    >
      <div className="card-face">
        <span className="card-face-value">{faceValue}</span>
        {faceSuit && (
          <span className="card-face-suit" style={{ color: suitColors[faceSuit] }}>
            <SuitSymbol suit={faceSuit} size={22} />
          </span>
        )}
      </div>
      <div className={`badges ${hasPositiveBadges ? 'visible' : 'empty'}`}>
        {knownColor && knownNumber && (
          <span
            className="badge combined"
            style={{ '--badge-color': suitColors[knownColor], '--badge-fg': suitBadgeForeground[knownColor] } as CSSProperties}
          >
            <SuitSymbol suit={knownColor} size={12} className="badge-icon" />
            {knownNumber}
          </span>
        )}
        {knownColor && !knownNumber && (
          <span
            className="badge color"
            style={{ '--badge-color': suitColors[knownColor], '--badge-fg': suitBadgeForeground[knownColor] } as CSSProperties}
          >
            <SuitSymbol suit={knownColor} size={12} className="badge-icon" />
          </span>
        )}
        {!knownColor && knownNumber && (
          <span className="badge number">{knownNumber}</span>
        )}
      </div>
      <div className={`negative-badges ${hasNegativeBadges ? 'visible' : 'empty'}`}>
        {notColors.map((color) => (
          <span
            key={color}
            className="badge not-color negative"
            style={{ '--badge-color': suitColors[color] } as CSSProperties}
          >
            <SuitSymbol suit={color} size={12} className="badge-icon" />
          </span>
        ))}
        {notNumbers.map((number) => (
          <span key={number} className="badge not-number negative">{number}</span>
        ))}
      </div>
    </button>
  );
}

export default App;
