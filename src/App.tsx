import { useEffect, useMemo, useRef, useState } from 'react';
import { CardsThree, Fire, LightbulbFilament } from '@phosphor-icons/react';
import {
  CARD_NUMBERS,
  HanabiGame,
  type GameLogEntry,
  type HanabiPerspectiveState,
  type PerspectiveCard,
  type PlayerId,
  type Suit
} from './game';
import { useLocalStorageState } from './hooks/useLocalStorageState';

const LOCAL_DEBUG_SETUP = {
  playerNames: ['Ari', 'Blair', 'Casey'],
  playerIds: ['p1', 'p2', 'p3'],
  shuffleSeed: 17
};

const DEBUG_MODE_STORAGE_KEY = 'hanabi.debug_mode';
const NEGATIVE_COLOR_HINTS_STORAGE_KEY = 'hanabi.negative_color_hints';
const NEGATIVE_NUMBER_HINTS_STORAGE_KEY = 'hanabi.negative_number_hints';
const MAX_PEG_PIPS = 4;

type PegPipState = 'filled' | 'hollow' | 'unused';

const suitColors: Record<Suit, string> = {
  R: '#e64d5f',
  Y: '#f4c21b',
  G: '#2dc96d',
  B: '#4f8eff',
  W: '#a8b8cc',
  M: '#d46eb3'
};

const suitNames: Record<Suit, string> = {
  R: 'red',
  Y: 'yellow',
  G: 'green',
  B: 'blue',
  W: 'white',
  M: 'multicolor'
};

function getPegPipStates(remaining: number, total: number): PegPipState[] {
  const clampedRemaining = Math.min(Math.max(remaining, 0), MAX_PEG_PIPS);
  const clampedTotal = Math.min(Math.max(total, 0), MAX_PEG_PIPS);

  return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
    if (index >= clampedTotal) return 'unused';
    if (index < clampedRemaining) return 'filled';
    return 'hollow';
  });
}

function isTerminalStatus(status: HanabiPerspectiveState['status']): boolean {
  return status === 'won' || status === 'lost' || status === 'finished';
}

function formatLogMessage(log: GameLogEntry): string {
  if (log.type === 'hint') {
    if (log.hintType === 'number') {
      if (log.number === null) return `${log.actorName} gave a number hint to ${log.targetName}`;
      return `${log.actorName} hinted ${log.number}s to ${log.targetName}`;
    }

    if (log.suit === null) return `${log.actorName} gave a color hint to ${log.targetName}`;
    return `${log.actorName} hinted ${suitNames[log.suit]} to ${log.targetName}`;
  }

  if (log.type === 'play') {
    if (log.success) return `${log.actorName} played ${suitNames[log.suit]} ${log.number}`;
    return `${log.actorName} misplayed ${suitNames[log.suit]} ${log.number} and burned a fuse`;
  }

  if (log.type === 'discard') {
    if (log.gainedHint) return `${log.actorName} discarded ${suitNames[log.suit]} ${log.number} and regained a hint`;
    return `${log.actorName} discarded ${suitNames[log.suit]} ${log.number}`;
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

  return `Game finished with score ${log.score}`;
}

function getLogBadge(log: GameLogEntry): string {
  if (log.type === 'hint') return 'Hint';
  if (log.type === 'play') return 'Play';
  if (log.type === 'discard') return 'Discard';
  if (log.type === 'draw') return 'Draw';
  return 'Status';
}

function App() {
  const gameRef = useRef<HanabiGame | null>(null);
  if (!gameRef.current) {
    gameRef.current = new HanabiGame(LOCAL_DEBUG_SETUP);
  }

  const game = gameRef.current;
  const [gameState, setGameState] = useState(() => game.getSnapshot());
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDebugMode, setIsDebugMode] = useLocalStorageState<boolean>(DEBUG_MODE_STORAGE_KEY, true);
  const [showNegativeColorHints, setShowNegativeColorHints] = useLocalStorageState<boolean>(
    NEGATIVE_COLOR_HINTS_STORAGE_KEY,
    true
  );
  const [showNegativeNumberHints, setShowNegativeNumberHints] = useLocalStorageState<boolean>(
    NEGATIVE_NUMBER_HINTS_STORAGE_KEY,
    true
  );
  const logListRef = useRef<HTMLDivElement | null>(null);

  const perspectivePlayerId = gameState.players[gameState.currentTurnPlayerIndex]?.id;
  if (!perspectivePlayerId) {
    throw new Error('Current turn player is missing');
  }

  const perspective = useMemo(
    () => game.getPerspectiveState(perspectivePlayerId),
    [game, gameState, perspectivePlayerId]
  );
  const others = perspective.players.filter((player) => player.id !== perspective.viewerId);
  const viewer = perspective.players.find((player) => player.id === perspective.viewerId);
  if (!viewer) {
    throw new Error(`Missing viewer ${perspective.viewerId}`);
  }

  const tablePlayers = [...others, viewer];
  const lastLog = perspective.logs[perspective.logs.length - 1] ?? null;
  const orderedLogs = [...perspective.logs].reverse();
  const hintTokenStates = Array.from({ length: perspective.maxHintTokens }, (_, index) => index < perspective.hintTokens);
  const remainingFuses = perspective.maxFuseTokens - perspective.fuseTokensUsed;
  const fuseTokenStates = Array.from({ length: perspective.maxFuseTokens }, (_, index) => index < remainingFuses);
  const gameOver = isTerminalStatus(perspective.status);

  function commit(command: () => void): void {
    try {
      command();
      setGameState(game.getSnapshot());
    } catch {
    }
  }

  function handlePlayPress(): void {
    if (!isDebugMode) return;
    setIsMenuOpen(false);
    commit(() => {
      game.beginPlaySelection();
    });
  }

  function handleDiscardPress(): void {
    if (!isDebugMode) return;
    setIsMenuOpen(false);
    commit(() => {
      game.beginDiscardSelection();
    });
  }

  function handleHintColorPress(): void {
    if (!isDebugMode) return;
    setIsMenuOpen(false);
    commit(() => {
      game.beginColorHintSelection();
    });
  }

  function handleHintNumberPress(): void {
    if (!isDebugMode) return;
    setIsMenuOpen(false);
    commit(() => {
      game.beginNumberHintSelection();
    });
  }

  function handleCardSelect(playerId: PlayerId, cardId: string): void {
    if (!isDebugMode) return;

    setIsMenuOpen(false);
    commit(() => {
      const pendingAction = game.state.ui.pendingAction;
      const currentPlayer = game.state.players[game.state.currentTurnPlayerIndex];
      const selectedCard = game.state.cards[cardId];

      if (!selectedCard) {
        throw new Error(`Unknown card: ${cardId}`);
      }

      if (pendingAction === 'play') {
        if (playerId !== currentPlayer.id) {
          return;
        }

        game.playCard(cardId);
        return;
      }

      if (pendingAction === 'discard') {
        if (playerId !== currentPlayer.id) {
          return;
        }

        game.discardCard(cardId);
        return;
      }

      if (pendingAction === 'hint-color') {
        if (playerId === currentPlayer.id) {
          return;
        }

        game.giveColorHint(playerId, selectedCard.suit);
        return;
      }

      if (pendingAction === 'hint-number') {
        if (playerId === currentPlayer.id) {
          return;
        }

        game.giveNumberHint(playerId, selectedCard.number);
      }
    });
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

  function handleLeavePress(): void {
    setIsMenuOpen(false);
    setIsLogDrawerOpen(false);
    setIsDebugMode(false);
    commit(() => {
      game.cancelSelection();
    });
  }

  function handleDebugToggle(): void {
    setIsDebugMode((current) => !current);
    setIsMenuOpen(false);
    commit(() => {
      game.cancelSelection();
    });
  }

  function handleNegativeColorHintsToggle(): void {
    setShowNegativeColorHints((current) => !current);
    setIsMenuOpen(false);
  }

  function handleNegativeNumberHintsToggle(): void {
    setShowNegativeNumberHints((current) => !current);
    setIsMenuOpen(false);
  }

  useEffect(() => {
    if (!isLogDrawerOpen) return;
    logListRef.current?.scrollTo({ top: 0 });
  }, [isLogDrawerOpen]);

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
        style={{ '--suit-count': String(perspective.activeSuits.length) } as React.CSSProperties}
        data-testid="fireworks-grid"
      >
        {perspective.activeSuits.map((suit) => {
          const height = perspective.fireworksHeights[suit];
          return (
            <div key={suit} className="tower" style={{ '--suit': suitColors[suit] } as React.CSSProperties} data-testid={`tower-${suit}`}>
              <div className="tower-stack">
                {CARD_NUMBERS.map((num) => {
                  const isLit = num <= height;
                  const remaining = perspective.knownRemainingCounts[suit][num];
                  const knownUnavailable = perspective.knownUnavailableCounts[suit][num];
                  const totalCopies = remaining + knownUnavailable;
                  const blocked = num > height && remaining === 0;
                  const pipStates = getPegPipStates(remaining, totalCopies);

                  return (
                    <div
                      key={num}
                      className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}
                      data-testid={`peg-${suit}-${num}`}
                    >
                      <span className="peg-num">{blocked ? '✕' : num}</span>
                      <span className="peg-pips" aria-label={`${remaining} copies known available`}>
                        {pipStates.map((pipState, pipIndex) => (
                          <span key={`pip-${pipIndex}`} className={`peg-pip ${pipState}`} />
                        ))}
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
        style={{ '--player-count': String(tablePlayers.length) } as React.CSSProperties}
        data-testid="table-shell"
      >
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
          <span className="last-action-label">Last</span>
          <span className="last-action-message">{lastLog ? formatLogMessage(lastLog) : 'No actions yet'}</span>
        </button>

        <section className="actions">
          <div className="action-slot">
            <button
              type="button"
              className="action-button danger"
              data-testid="actions-discard"
              onClick={handleDiscardPress}
              disabled={gameOver || !isDebugMode}
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
              disabled={gameOver || !isDebugMode}
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
              disabled={gameOver || !isDebugMode}
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
              disabled={gameOver || !isDebugMode}
            >
              <span className="action-main">Play</span>
            </button>
          </div>
        </section>
      </section>

      <button
        type="button"
        className={`menu-scrim ${isMenuOpen ? 'open' : ''}`}
        aria-label="Close menu"
        aria-hidden={!isMenuOpen}
        tabIndex={isMenuOpen ? 0 : -1}
        onClick={closeMenu}
      />

      <aside className={`menu-panel ${isMenuOpen ? 'open' : ''}`} aria-hidden={!isMenuOpen}>
        <button type="button" className="menu-item" data-testid="menu-leave" onClick={handleLeavePress}>Leave</button>
        <button
          type="button"
          className="menu-item menu-toggle-item"
          data-testid="menu-debug-toggle"
          onClick={handleDebugToggle}
        >
          <span>Debug</span>
          <span data-testid="menu-debug-value">{isDebugMode ? 'On' : 'Off'}</span>
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
      </aside>

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
              <span className="log-item-message">{formatLogMessage(logEntry)}</span>
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

  let faceValue: string | number = '?';
  let bgColor: string | undefined;

  if (card.isHiddenFromViewer) {
    faceValue = knownNumber ?? '?';
    bgColor = knownColor ? suitColors[knownColor] : (knownNumber ? '#9eb2d4' : undefined);
  } else {
    if (card.suit === null || card.number === null) {
      throw new Error(`Visible card ${card.id} is missing face values`);
    }

    faceValue = card.number;
    bgColor = suitColors[card.suit];
  }

  const notColors = knownColor || !showNegativeColorHints ? [] : card.hints.notColors;
  const notNumbers = knownNumber || !showNegativeNumberHints ? [] : card.hints.notNumbers;
  const hasHints = knownColor || knownNumber || notColors.length > 0 || notNumbers.length > 0;

  return (
    <button
      type="button"
      className="card"
      style={{ '--card-bg': bgColor } as React.CSSProperties}
      onClick={onSelect}
      data-testid={testId}
      aria-pressed={false}
    >
      <div className="card-face">
        {faceValue}
      </div>
      <div className={`badges ${hasHints ? 'visible' : 'empty'}`}>
        {knownColor && knownNumber && (
          <span className="badge combined" style={{ '--badge-color': suitColors[knownColor] } as React.CSSProperties}>
            {knownColor}
            {knownNumber}
          </span>
        )}
        {knownColor && !knownNumber && (
          <span className="badge color" style={{ '--badge-color': suitColors[knownColor] } as React.CSSProperties} />
        )}
        {!knownColor && knownNumber && (
          <span className="badge number">{knownNumber}</span>
        )}
        {notColors.map((color) => (
          <span key={color} className="badge not-color" style={{ '--badge-color': suitColors[color] } as React.CSSProperties}>
            x
          </span>
        ))}
        {notNumbers.map((number) => (
          <span key={number} className="badge not-number">{number}</span>
        ))}
      </div>
    </button>
  );
}

export default App;
