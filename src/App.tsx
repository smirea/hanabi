import { useEffect, useMemo, useRef, useState, type CSSProperties, type ComponentType, type ReactNode } from 'react';
import {
  CardsThree,
  Drop,
  Fire,
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
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { createDebugNamespace, storageKeys } from './storage';

const LOCAL_DEBUG_SETUP = {
  playerNames: ['Ari', 'Blair', 'Casey'],
  playerIds: ['p1', 'p2', 'p3'],
  shuffleSeed: 17
};

const MAX_PEG_PIPS = 4;

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
  W: 'white',
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

function LogCardChip({ suit, number }: { suit: Suit; number: number }) {
  return (
    <span
      className="log-chip log-chip-card"
      style={{ '--chip-color': suitColors[suit], '--chip-fg': suitBadgeForeground[suit] } as CSSProperties}
      aria-label={`${suitNames[suit]} ${number}`}
    >
      {number}
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
      <SuitSymbol suit={suit} size={12} />
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
          {log.actorName} hinted {touchedCount}x
          <LogHintChipNumber number={log.number} /> to {log.targetName}
        </>
      );
    }

    if (log.suit === null) return `${log.actorName} gave a color hint to ${log.targetName}`;
    return (
      <>
        {log.actorName} hinted {touchedCount}x
        <LogHintChipSuit suit={log.suit} /> to {log.targetName}
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

function formatPendingAction(action: PendingCardAction): string {
  if (action === 'play') return 'Play selected';
  if (action === 'discard') return 'Discard selected';
  if (action === 'hint-color') return 'Color hint selected';
  if (action === 'hint-number') return 'Number hint selected';
  return 'Last';
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

function arraysEqual(left: string[], right: string[]): boolean {
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

function prefersDarkMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
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

function App() {
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
      setDebugFramePlayerId(getDebugNetworkPlayerIdFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const [isDebugNetworkShellOpen, setIsDebugNetworkShellOpen] = useLocalStorageState(storageKeys.debugNetworkShell, false);
  const [isDarkMode, setIsDarkMode] = useLocalStorageState(storageKeys.darkMode, prefersDarkMode());

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
        framePlayerId={debugFramePlayerId}
        onOpenDebugNetworkShell={null}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((current) => !current)}
      />
    );
  }

  if (isDebugNetworkShellOpen) {
    return <DebugNetworkShell onExit={() => setIsDebugNetworkShellOpen(false)} />;
  }

  return (
    <GameClient
      runtime="standard"
      framePlayerId={null}
      onOpenDebugNetworkShell={() => setIsDebugNetworkShellOpen(true)}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode((current) => !current)}
    />
  );
}

function DebugNetworkShell({ onExit }: { onExit: () => void }) {
  const [storedPlayers, setStoredPlayers] = useLocalStorageState(
    storageKeys.debugNetworkPlayers,
    getDebugNetworkPlayersFromRoom()
  );
  const normalizedPlayers = useMemo(() => normalizeShellPlayers(storedPlayers), [storedPlayers]);
  const [activePlayer, setActivePlayer] = useLocalStorageState(storageKeys.debugNetworkActivePlayer, normalizedPlayers[0]);

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
  framePlayerId,
  onOpenDebugNetworkShell,
  isDarkMode,
  onToggleDarkMode
}: {
  runtime: ClientRuntime;
  framePlayerId: string | null;
  onOpenDebugNetworkShell: (() => void) | null;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  const isDebugNetworkFrame = runtime === 'debug-network-frame';

  const gameRef = useRef<HanabiGame | null>(null);
  if (!gameRef.current) {
    gameRef.current = new HanabiGame(LOCAL_DEBUG_SETUP);
  }

  const debugGame = gameRef.current;
  const [debugGameState, setDebugGameState] = useState(() => debugGame.getSnapshot());
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingCardAction>(null);
  const [wildColorHintTargetPlayerId, setWildColorHintTargetPlayerId] = useState<PlayerId | null>(null);
  const [isDebugMode, setIsDebugMode] = useLocalStorageState(storageKeys.debugMode, true);
  const storageNamespace = useMemo(
    () => (isDebugNetworkFrame && framePlayerId ? createDebugNamespace(framePlayerId) : null),
    [framePlayerId, isDebugNetworkFrame]
  );
  const [playerName, setPlayerName] = useLocalStorageState(storageKeys.playerName, '', storageNamespace);
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

  const isLocalDebugMode = !isDebugNetworkFrame && isDebugMode;
  const online = useOnlineSession(!isLocalDebugMode && !isDebugNetworkFrame, DEFAULT_ROOM_ID);
  const debugNetwork = useDebugNetworkSession(isDebugNetworkFrame ? framePlayerId : null);
  const activeSession: OnlineSession = isDebugNetworkFrame ? debugNetwork : online;
  const onlineState = activeSession.state;
  const setActiveSelfName = activeSession.setSelfName;

  useEffect(() => {
    if (isLocalDebugMode) {
      return;
    }

    setActiveSelfName(playerName);
  }, [isLocalDebugMode, playerName, setActiveSelfName]);

  const activeGameState = isLocalDebugMode ? debugGameState : onlineState.gameState;
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

  const showLobby = !isLocalDebugMode && (
    onlineState.phase === 'lobby'
    || onlineState.gameState === null
    || !isOnlineParticipant
  );

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

  useEffect(() => {
    if (!isLogDrawerOpen) return;
    logListRef.current?.scrollTo({ top: 0 });
  }, [isLogDrawerOpen]);

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

      commitLocal(() => {
        if (pending === 'play') {
          if (playerId !== currentPlayer.id) {
            return;
          }

          debugGame.playCard(cardId);
          return;
        }

        if (pending === 'discard') {
          if (playerId !== currentPlayer.id) {
            return;
          }

          debugGame.discardCard(cardId);
          return;
        }

        if (pending === 'hint-color') {
          if (playerId === currentPlayer.id) {
            return;
          }

          debugGame.giveColorHint(playerId, selectedSuit);
          return;
        }

        if (pending === 'hint-number') {
          if (playerId === currentPlayer.id) {
            return;
          }

          debugGame.giveNumberHint(playerId, selectedNumber);
        }
      });
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
    setIsLogDrawerOpen(true);
  }

  function closeLogDrawer(): void {
    if (!isLogDrawerOpen) return;
    setIsLogDrawerOpen(false);
  }

  function toggleMenu(): void {
    if (isLogDrawerOpen) {
      setIsLogDrawerOpen(false);
    }

    setIsMenuOpen((current) => !current);
  }

  function closeMenu(): void {
    if (!isMenuOpen) return;
    setIsMenuOpen(false);
  }

  function handleLocalDebugToggle(): void {
    if (isDebugNetworkFrame) {
      return;
    }

    setIsMenuOpen(false);
    setIsLogDrawerOpen(false);
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

  function handleEnableDebugMode(): void {
    if (isDebugNetworkFrame) {
      return;
    }

    setIsDebugMode(true);
  }

  function handleOpenDebugNetworkShell(): void {
    if (isDebugNetworkFrame || !onOpenDebugNetworkShell) {
      return;
    }

    setIsMenuOpen(false);
    onOpenDebugNetworkShell();
  }

  function handleNegativeColorHintsToggle(): void {
    setShowNegativeColorHints((current) => !current);
    setIsMenuOpen(false);
  }

  function handleNegativeNumberHintsToggle(): void {
    setShowNegativeNumberHints((current) => !current);
    setIsMenuOpen(false);
  }

  function handleDarkModeToggle(): void {
    onToggleDarkMode();
    setIsMenuOpen(false);
  }

  function handleReconnectPress(): void {
    activeSession.requestSync();
    setPendingAction(null);
    setWildColorHintTargetPlayerId(null);
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
    setIsLogDrawerOpen(false);
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
        roomId={onlineState.roomId}
        status={onlineState.status}
        error={onlineState.error}
        members={onlineState.members}
        hostId={onlineState.hostId}
        isHost={onlineState.isHost}
        selfId={onlineState.selfId}
        selfName={playerName}
        onSelfNameChange={setPlayerName}
        phase={onlineState.phase}
        settings={onlineState.settings}
        isGameInProgress={onlineState.phase === 'playing' && !isOnlineParticipant}
        onStart={activeSession.startGame}
        onReconnect={activeSession.requestSync}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        onEnableDebugMode={isDebugNetworkFrame ? null : handleEnableDebugMode}
        onEnableDebugNetwork={isDebugNetworkFrame ? null : handleOpenDebugNetworkShell}
        onUpdateSettings={activeSession.updateSettings}
      />
    );
  }

  if (!activeGameState || !perspective) {
    return (
      <main className="lobby" data-testid="lobby-root">
        <section className="lobby-card">
          <h1 className="lobby-title">Waiting For Room Snapshot</h1>
          <button
            type="button"
            className="lobby-button"
            onClick={activeSession.requestSync}
            data-testid="lobby-reconnect"
          >
            Reconnect
          </button>
        </section>
      </main>
    );
  }

  const others = perspective.players.filter((player) => player.id !== perspective.viewerId);
  const viewer = perspective.players.find((player) => player.id === perspective.viewerId);
  if (!viewer) {
    throw new Error(`Missing viewer ${perspective.viewerId}`);
  }

  const tablePlayers = [...others, viewer];
  const activeTurnIndex = tablePlayers.findIndex((player) => player.isCurrentTurn);
  const lastLog = perspective.logs[perspective.logs.length - 1] ?? null;
  const orderedLogs = [...perspective.logs].reverse();
  const hintTokenStates = Array.from({ length: perspective.maxHintTokens }, (_, index) => index < perspective.hintTokens);
  const remainingFuses = perspective.maxFuseTokens - perspective.fuseTokensUsed;
  const fuseTokenStates = Array.from({ length: perspective.maxFuseTokens }, (_, index) => index < remainingFuses);
  const gameOver = isTerminalStatus(perspective.status);
  const isOnlineTurn = !isLocalDebugMode && onlineState.selfId !== null && perspective.currentTurnPlayerId === onlineState.selfId;
  const canAct = isLocalDebugMode || (onlineState.status === 'connected' && isOnlineTurn);
  const showReconnectAction = !isLocalDebugMode && onlineState.status !== 'connected';
  const discardDisabled = gameOver || !canAct || perspective.hintTokens >= perspective.maxHintTokens;
  const colorHintDisabled = gameOver || !canAct || perspective.hintTokens <= 0;
  const numberHintDisabled = gameOver || !canAct || perspective.hintTokens <= 0;
  const playDisabled = gameOver || !canAct;

  return (
    <main className="app" data-testid="app-root">
      <section className="stats">
        <div className="stat hints-stat" data-testid="status-hints">
          <div className="token-grid hints-grid" aria-label="Hint tokens">
            {hintTokenStates.map((isFilled, index) => (
              <LightbulbFilament
                key={`hint-token-${index}`}
                size={15}
                weight={isFilled ? 'fill' : 'regular'}
                className={isFilled ? 'token-icon filled' : 'token-icon hollow'}
              />
            ))}
          </div>
          <span className="visually-hidden" data-testid="status-hints-count">{perspective.hintTokens}</span>
        </div>

        <div className="stat deck-stat" data-testid="status-deck">
          <div className="deck-pill">
            <CardsThree size={17} weight="fill" />
            <span className="deck-count" data-testid="status-deck-count">{perspective.drawDeckCount}</span>
          </div>
        </div>

        <div className="stat fuses-stat" data-testid="status-fuses">
          <div className="token-grid fuses-grid" aria-label="Fuse tokens">
            {fuseTokenStates.map((isFilled, index) => (
              <Fire
                key={`fuse-token-${index}`}
                size={24}
                weight={isFilled ? 'fill' : 'regular'}
                className={isFilled ? 'token-icon filled danger' : 'token-icon hollow danger'}
              />
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
	        className="table-shell"
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
                {player.isViewer ? `${player.name} (You)` : player.name}
              </span>
              {player.isCurrentTurn && (
                <span className="turn-chip" data-testid={`player-turn-${player.id}`}>
                  <span className="turn-chip-dot" />
                  Turn
                </span>
              )}
            </header>
            <div className="cards">
              {player.cards.map((card, cardIndex) => (
                <CardView
                  key={card.id}
                  card={card}
                  showNegativeColorHints={showNegativeColorHints}
                  showNegativeNumberHints={showNegativeNumberHints}
                  onSelect={() => handleCardSelect(player.id, card.id)}
                  testId={`card-${player.id}-${cardIndex}`}
                />
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="bottom-panel">
        <button type="button" className="last-action" onClick={openLogDrawer} data-testid="status-last-action">
          <span className="last-action-label">{formatPendingAction(isLocalDebugMode ? debugGame.state.ui.pendingAction : pendingAction)}</span>
          <span className="last-action-message">{lastLog ? renderLogMessage(lastLog) : 'No actions yet'}</span>
        </button>

        <section className="actions">
          <div className="action-slot">
            <button
              type="button"
              className="action-button danger"
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
              className="action-button"
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
              className="action-button"
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
              className="action-button primary"
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
            className="menu-item menu-toggle-item"
            data-testid="menu-dark-mode-toggle"
            aria-pressed={isDarkMode}
            onClick={handleDarkModeToggle}
          >
            <span>Dark Mode</span>
            <span data-testid="menu-dark-mode-value">{isDarkMode ? 'On' : 'Off'}</span>
          </button>

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
        </aside>
      </>

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
    </main>
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
  phase,
  settings,
  isGameInProgress,
  onStart,
  onReconnect,
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
  phase: 'lobby' | 'playing';
  settings: LobbySettings;
  isGameInProgress: boolean;
  onStart: () => void;
  onReconnect: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onEnableDebugMode: (() => void) | null;
  onEnableDebugNetwork: (() => void) | null;
  onUpdateSettings: (next: Partial<LobbySettings>) => void;
}) {
  const host = members.find((member) => member.peerId === hostId) ?? null;
  const canStart = phase === 'lobby' && members.length >= 2 && members.length <= 5;
  const showReconnect = status !== 'connected' || error !== null;
  const playerCountError = members.length > 5 ? 'Max 5 players' : (members.length < 2 ? 'Need at least 2 players' : null);
  const handSize = members.length <= 3 ? 5 : 4;
  const deckSize = 50 + (settings.includeMulticolor ? (settings.multicolorShortDeck ? 5 : 10) : 0);
  const maxScore = (settings.includeMulticolor ? 6 : 5) * 5;
  const defaultNamePlaceholder = selfId ? `Player ${selfId.slice(-4).toUpperCase()}` : 'Player';

  return (
    <main className="lobby" data-testid="lobby-root">
      <section className="lobby-card">
        <div className="lobby-summary">
          <header className="lobby-header">
            <h1 className="lobby-title">Room Staging</h1>
            <div className="lobby-header-actions">
              <button
                type="button"
                className="lobby-button subtle"
                onClick={onToggleDarkMode}
                aria-pressed={isDarkMode}
                data-testid="lobby-theme-toggle"
              >
                Dark: {isDarkMode ? 'On' : 'Off'}
              </button>
              {onEnableDebugMode && (
                <button
                  type="button"
                  className="lobby-button subtle"
                  onClick={onEnableDebugMode}
                  data-testid="lobby-debug-mode"
                >
                  Debug Local
                </button>
              )}
              {onEnableDebugNetwork && (
                <button
                  type="button"
                  className="lobby-button subtle"
                  onClick={onEnableDebugNetwork}
                  data-testid="lobby-debug-network"
                >
                  Debug Network
                </button>
              )}
            </div>
          </header>

          <p className="lobby-room-line" data-testid="lobby-room-line">Room {roomId}</p>

          <div className="lobby-name-row" data-testid="lobby-name-row">
            <label className="lobby-name-label" htmlFor="lobby-name-input">Name</label>
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
          <h2 className="lobby-section-title">Players ({members.length})</h2>
          <div className="lobby-player-list">
            {members.map((member) => (
              <article key={member.peerId} className="lobby-player" data-testid={`lobby-player-${member.peerId}`}>
                <div>
                  <div className="lobby-player-name">{member.name}</div>
                </div>
                <div className="lobby-chip-row">
                  {member.peerId === hostId && <span className="lobby-chip host">Host</span>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lobby-settings">
          <h2 className="lobby-section-title">Configuration</h2>
          {isHost && phase === 'lobby' ? (
            <div className="lobby-toggle-list">
              <button
                type="button"
                className="lobby-setting-toggle"
                onClick={() => {
                  const nextIncludeMulticolor = !settings.includeMulticolor;
                  onUpdateSettings({
                    includeMulticolor: nextIncludeMulticolor,
                    multicolorShortDeck: nextIncludeMulticolor ? settings.multicolorShortDeck : false,
                    multicolorWildHints: nextIncludeMulticolor ? settings.multicolorWildHints : false
                  });
                }}
                data-testid="lobby-setting-extra-suit"
              >
                <span>Extra suit (M)</span>
                <span>{settings.includeMulticolor ? 'On' : 'Off'}</span>
              </button>
              <button
                type="button"
                className="lobby-setting-toggle"
                onClick={() => onUpdateSettings({
                  multicolorShortDeck: !settings.multicolorShortDeck,
                  multicolorWildHints: false
                })}
                disabled={!settings.includeMulticolor}
                data-testid="lobby-setting-short-deck"
              >
                <span>Multicolor short deck</span>
                <span>{settings.multicolorShortDeck ? 'On' : 'Off'}</span>
              </button>
              <button
                type="button"
                className="lobby-setting-toggle"
                onClick={() => onUpdateSettings({
                  multicolorWildHints: !settings.multicolorWildHints,
                  multicolorShortDeck: false
                })}
                disabled={!settings.includeMulticolor}
                data-testid="lobby-setting-wild-multicolor"
              >
                <span>Wild multicolor hints</span>
                <span>{settings.multicolorWildHints ? 'On' : 'Off'}</span>
              </button>
              <button
                type="button"
                className="lobby-setting-toggle"
                onClick={() => onUpdateSettings({ endlessMode: !settings.endlessMode })}
                data-testid="lobby-setting-endless"
              >
                <span>Endless mode</span>
                <span>{settings.endlessMode ? 'On' : 'Off'}</span>
              </button>
            </div>
          ) : (
            <ul className="lobby-settings-list" data-testid="lobby-settings-readonly">
              <li>Extra suit (M): {settings.includeMulticolor ? 'On' : 'Off'}</li>
              <li>Multicolor short deck: {settings.multicolorShortDeck ? 'On' : 'Off'}</li>
              <li>Wild multicolor hints: {settings.multicolorWildHints ? 'On' : 'Off'}</li>
              <li>Endless mode: {settings.endlessMode ? 'On' : 'Off'}</li>
            </ul>
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
    </main>
  );
}

function CardView({
  card,
  showNegativeColorHints,
  showNegativeNumberHints,
  onSelect,
  testId
}: {
  card: PerspectiveCard;
  showNegativeColorHints: boolean;
  showNegativeNumberHints: boolean;
  onSelect: () => void;
  testId: string;
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
      onClick={onSelect}
      data-testid={testId}
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
