import { useEffect, useRef, useState } from 'react';
import { CardsThree, Fire, LightbulbFilament } from '@phosphor-icons/react';
import { exampleGameState } from './game-state-example';
import { SUITS, CARD_NUMBERS, type Card, type Suit, type CardNumber, type GameLogEntry } from './types';

const gameState = exampleGameState;
const MAX_HINT_TOKENS = 8;
const MAX_FUSES = 3;
const MAX_PEG_PIPS = 4;

const suitColors: Record<Suit, string> = {
  R: '#e64d5f',
  Y: '#f4c21b',
  G: '#2dc96d',
  B: '#4f8eff',
  W: '#a8b8cc',
  M: '#d46eb3'
};

const cardCopies: Record<CardNumber, number> = {
  1: 4,
  2: 3,
  3: 2,
  4: 2,
  5: 1
};

const suitNames: Record<Suit, string> = {
  R: 'red',
  Y: 'yellow',
  G: 'green',
  B: 'blue',
  W: 'white',
  M: 'pink'
};

type SelectedCard = { playerId: string; cardId: string } | null;
type PegPipState = 'filled' | 'hollow' | 'unused';

function getFireworkHeight(suit: Suit): number {
  return gameState.fireworks[suit].length;
}

function getRemainingCount(suit: Suit, number: CardNumber): number {
  const total = cardCopies[number];
  let discarded = 0;

  for (const cardId of gameState.discardPile) {
    const card = gameState.cards[cardId];
    if (card && card.suit === suit && card.number === number) discarded++;
  }

  return total - discarded;
}

function isBlocked(suit: Suit, number: CardNumber): boolean {
  const height = getFireworkHeight(suit);
  if (number <= height) return false;
  return getRemainingCount(suit, number) === 0;
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

function formatLogMessage(log: GameLogEntry): string {
  if (log.type === 'hint') {
    if (log.hintType === 'number') {
      if (!log.number) return `${log.actorName} gave a number hint to ${log.targetName}`;
      return `${log.actorName} hinted ${log.number}s to ${log.targetName}`;
    }

    if (!log.suit) return `${log.actorName} gave a color hint to ${log.targetName}`;
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

  return `${log.actorName} drew ${log.count} card${log.count === 1 ? '' : 's'}`;
}

function getLogBadge(log: GameLogEntry): string {
  if (log.type === 'hint') return 'Hint';
  if (log.type === 'play') return 'Play';
  if (log.type === 'discard') return 'Discard';
  return 'Draw';
}

function App() {
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const feedbackTimeoutRef = useRef<number | null>(null);
  const logListRef = useRef<HTMLDivElement | null>(null);

  const currentPlayer = gameState.players[gameState.currentTurnPlayerIndex];
  const you = gameState.players.find((player) => player.id === 'you')!;
  const others = gameState.players.filter((player) => player.id !== 'you');
  const tablePlayers = [...others, you];
  const lastLog = gameState.logs[gameState.logs.length - 1];
  const orderedLogs = [...gameState.logs].reverse();

  const hintTokenStates = Array.from({ length: MAX_HINT_TOKENS }, (_, index) => index < gameState.hintTokens);
  const fuseTokenStates = Array.from({ length: MAX_FUSES }, (_, index) => index < gameState.fuseTokensUsed);

  function showFeedback(message: string): void {
    setFeedbackMessage(message);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedbackMessage(null);
    }, 1400);
  }

  function handleCardSelect(playerId: string, cardId: string): void {
    if (selectedCard && selectedCard.playerId === playerId && selectedCard.cardId === cardId) {
      setSelectedCard(null);
      showFeedback('Card selection cleared');
      return;
    }

    setSelectedCard({ playerId, cardId });

    const playerName = playerId === you.id
      ? 'your hand'
      : `${tablePlayers.find((player) => player.id === playerId)?.name ?? 'teammate'}'s hand`;
    showFeedback(`Selected card from ${playerName}`);
  }

  function handleActionPress(label: string): void {
    showFeedback(`${label} selected`);
  }

  function openLogDrawer(): void {
    if (isLogDrawerOpen) return;
    setIsLogDrawerOpen(true);
    showFeedback('Opened action log');
  }

  function closeLogDrawer(): void {
    if (!isLogDrawerOpen) return;
    setIsLogDrawerOpen(false);
    showFeedback('Closed action log');
  }

  useEffect(() => {
    if (!isLogDrawerOpen) return;
    logListRef.current?.scrollTo({ top: 0 });
  }, [isLogDrawerOpen]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  return (
    <main className="app">
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
        </div>

        <div className="stat deck-stat" data-testid="status-deck">
          <div className="deck-pill">
            <CardsThree size={17} weight="fill" />
            <span className="deck-count">{gameState.drawDeck.length}</span>
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
        </div>
      </section>

      <section className="fireworks">
        {SUITS.map((suit) => {
          const height = getFireworkHeight(suit);
          return (
            <div key={suit} className="tower" style={{ '--suit': suitColors[suit] } as React.CSSProperties}>
              <div className="tower-stack">
                {CARD_NUMBERS.map((num) => {
                  const isLit = num <= height;
                  const blocked = isBlocked(suit, num);
                  const remaining = getRemainingCount(suit, num);
                  const pipStates = getPegPipStates(remaining, cardCopies[num]);

                  return (
                    <div key={num} className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}>
                      <span className="peg-num">{blocked ? '✕' : num}</span>
                      <span className="peg-pips" aria-label={`${remaining} copies remaining`}>
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

      <section className="table-shell" style={{ '--player-count': String(tablePlayers.length) } as React.CSSProperties}>
        {tablePlayers.map((player) => {
          const isCurrentTurn = player.id === currentPlayer.id;
          const isYou = player.id === you.id;
          const isTargeted = selectedCard?.playerId === player.id;

          return (
            <article
              key={player.id}
              className={`player ${isCurrentTurn ? 'active' : ''} ${isYou ? 'you-player' : ''} ${isTargeted ? 'targeted' : ''}`}
            >
              <header className="player-header">
                <span className="player-name">{isYou ? 'You' : player.name}</span>
                {isCurrentTurn && (
                  <span className="turn-chip">
                    <span className="turn-chip-dot" />
                    Turn
                  </span>
                )}
              </header>
              <div className="cards">
                {player.cards.map((cardId, cardIndex) => (
                  <CardView
                    key={cardId}
                    card={gameState.cards[cardId]!}
                    hidden={isYou}
                    selected={selectedCard?.cardId === cardId}
                    onSelect={() => handleCardSelect(player.id, cardId)}
                    testId={`card-${player.id}-${cardIndex}`}
                  />
                ))}
              </div>
            </article>
          );
        })}
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
              className="action-button"
              data-testid="actions-color"
              onClick={() => handleActionPress('Color')}
            >
              <span className="action-main">Color</span>
            </button>
          </div>

          <div className="action-slot">
            <button
              type="button"
              className="action-button"
              data-testid="actions-number"
              onClick={() => handleActionPress('Number')}
            >
              <span className="action-main">Number</span>
            </button>
          </div>

          <div className="action-slot menu-slot">
            <button
              type="button"
              className="action-button menu-toggle"
              aria-label="Open menu"
              aria-expanded={isLogDrawerOpen}
              data-testid="actions-menu"
              onClick={() => (isLogDrawerOpen ? closeLogDrawer() : openLogDrawer())}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <div className="action-slot">
            <button
              type="button"
              className="action-button primary"
              data-testid="actions-play"
              onClick={() => handleActionPress('Play')}
            >
              <span className="action-main">Play</span>
            </button>
          </div>

          <div className="action-slot">
            <button
              type="button"
              className="action-button danger"
              data-testid="actions-discard"
              onClick={() => handleActionPress('Discard')}
            >
              <span className="action-main">Discard</span>
            </button>
          </div>
        </section>
      </section>

      {feedbackMessage && (
        <div className="feedback-toast" role="status" aria-live="polite">
          {feedbackMessage}
        </div>
      )}

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
            <article key={logEntry.id} className="log-item">
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
  hidden,
  selected,
  onSelect,
  testId
}: {
  card: Card;
  hidden: boolean;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  const knownColor = card.hints.color;
  const knownNumber = card.hints.number;
  const faceValue = hidden ? (knownNumber ?? '?') : card.number;
  const bgColor = hidden
    ? (knownColor ? suitColors[knownColor] : (knownNumber ? '#9eb2d4' : undefined))
    : suitColors[card.suit];

  const notColors = knownColor ? [] : card.hints.notColors;
  const notNumbers = knownNumber ? [] : card.hints.notNumbers;
  const hasHints = knownColor || knownNumber || notColors.length > 0 || notNumbers.length > 0;

  return (
    <button
      type="button"
      className={`card ${selected ? 'selected' : ''}`}
      style={{ '--card-bg': bgColor } as React.CSSProperties}
      onClick={onSelect}
      data-testid={testId}
      aria-pressed={selected}
    >
      <div className="card-face">
        {faceValue}
      </div>
      <div className={`badges ${hasHints ? 'visible' : 'empty'}`}>
        {knownColor && knownNumber && (
          <span className="badge combined" style={{ '--badge-color': suitColors[knownColor] } as React.CSSProperties}>
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
            ✕
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
