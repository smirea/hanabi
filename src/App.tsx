import { exampleBlockedSummary, exampleDiscardSummary, exampleFireworkStatus, exampleGameState } from './game-state-example';
import { SUITS, type Card, type Suit } from './types';

const roomCode = 'HNB-47';
const hintTokenLimit = 8;
const fuseTokenLimit = 3;

const suitColors: Record<Suit, string> = {
  R: '#e64d5f',
  Y: '#f4c21b',
  G: '#2dc96d',
  B: '#4f8eff',
  W: '#dce2ec',
  M: '#ff6db5'
};

const suitNames: Record<Suit, string> = {
  R: 'Red',
  Y: 'Yellow',
  G: 'Green',
  B: 'Blue',
  W: 'White',
  M: 'Multi'
};

const gameState = exampleGameState;

function App() {
  const currentPlayer = gameState.players[gameState.currentTurnPlayerIndex];

  return (
    <main className="app" data-testid="app-shell">
      <section className="section header" data-testid="header-strip">
        <div className="header-item" data-testid="room-code">Room {roomCode}</div>
        <div className="header-item" data-testid="connection-status">Connected</div>
        <div className="header-item" data-testid="turn-status">{currentPlayer.name}&apos;s turn</div>
        <div className="header-item" data-testid="deck-count">Deck {gameState.drawDeck.length}</div>
      </section>

      <section className="section board" data-testid="board-strip">
        <div className="token-panel" data-testid="hint-tokens">
          <h2>Hints</h2>
          <strong>
            {gameState.hintTokens} / {hintTokenLimit}
          </strong>
        </div>
        <div className="token-panel" data-testid="fuse-tokens">
          <h2>Fuses</h2>
          <strong>
            {gameState.fuseTokensUsed} / {fuseTokenLimit} used
          </strong>
        </div>
        <div className="fireworks" data-testid="fireworks-strip">
          {SUITS.map((suit) => {
            const status = exampleFireworkStatus[suit];

            return (
              <div
                key={suit}
                className={`firework ${status.tone === 'complete' ? 'firework-complete' : ''} ${status.tone === 'blocked' ? 'firework-blocked' : ''}`}
                style={{ borderColor: suitColors[suit] }}
                data-testid={`firework-${suit}`}
              >
                <span>{suitNames[suit]}</span>
                <strong>{status.height}</strong>
                <small data-testid={`firework-status-${suit}`}>{status.statusLabel}</small>
              </div>
            );
          })}
        </div>
        <div className="board-note" data-testid="blocked-stacks">{exampleBlockedSummary}</div>
      </section>

      <section className="section players" data-testid="player-lanes">
        {gameState.players.map((player, playerIndex) => {
          const isCurrentTurn = playerIndex === gameState.currentTurnPlayerIndex;
          const hideCards = player.id === 'you';

          return (
            <article
              key={player.id}
              className={`player-lane ${isCurrentTurn ? 'current-turn' : ''}`}
              data-testid={`player-${player.id}`}
            >
              <header className="lane-header">
                <h2>{player.name}</h2>
                <span>{isCurrentTurn ? 'Active' : 'Waiting'}</span>
              </header>
              <div className="cards" data-testid={`cards-${player.id}`}>
                {player.cards.map((cardId, cardIndex) => (
                  <CardView
                    key={cardId}
                    card={gameState.cards[cardId]!}
                    playerId={player.id}
                    index={cardIndex}
                    hidden={hideCards}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className="section discard" data-testid="discard-strip">
        <header className="discard-header">
          <h2>Discard ({gameState.discardPile.length})</h2>
          <span>Cards out</span>
        </header>
        <div className="discard-grid" data-testid="discard-grid">
          {exampleDiscardSummary.map((entry) => (
            <div
              key={entry.key}
              className="discard-chip"
              style={{ borderColor: suitColors[entry.suit] }}
              data-testid={`discard-${entry.suit}-${entry.number}`}
            >
              <span>
                {entry.suit}
                {entry.number}
              </span>
              <strong>x{entry.count}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="section actions" data-testid="action-strip">
        <button type="button" data-testid="action-hint-color">Hint Color</button>
        <button type="button" data-testid="action-hint-number">Hint Number</button>
        <button type="button" data-testid="action-play">Play</button>
        <button type="button" data-testid="action-discard">Discard</button>
        <button type="button" data-testid="action-reconnect">Reconnect</button>
      </section>
    </main>
  );
}

function CardView({ card, playerId, index, hidden }: { card: Card; playerId: string; index: number; hidden: boolean }) {
  const displayCard = hidden ? '??' : `${card.suit}${card.number}`;
  const knownColor = card.hints.color;
  const borderColor = knownColor ? suitColors[knownColor] : hidden ? '#596579' : suitColors[card.suit];

  return (
    <div
      className={`card ${card.hints.recentlyHinted ? 'recent-hint' : ''}`}
      style={{ borderColor }}
      data-testid={`card-${playerId}-${index}`}
    >
      <div className="card-main" data-testid={`card-face-${playerId}-${index}`}>
        {displayCard}
      </div>
      <div className="hint-row" data-testid={`card-hints-${playerId}-${index}`}>
        <span className="chip" data-testid={`card-known-color-${playerId}-${index}`}>
          {knownColor ? `C:${knownColor}` : 'C:?'}
        </span>
        <span className="chip" data-testid={`card-known-number-${playerId}-${index}`}>
          {card.hints.number ? `V:${card.hints.number}` : 'V:?'}
        </span>
      </div>
      <div className="excluded-row" data-testid={`card-exclusions-${playerId}-${index}`}>
        {card.hints.notColors.map((excludedColor) => (
          <span key={excludedColor} className="chip muted" data-testid={`card-excluded-color-${playerId}-${index}-${excludedColor}`}>
            xC:{excludedColor}
          </span>
        ))}
        {card.hints.notNumbers.map((excludedNumber) => (
          <span key={excludedNumber} className="chip muted" data-testid={`card-excluded-number-${playerId}-${index}-${excludedNumber}`}>
            xV:{excludedNumber}
          </span>
        ))}
      </div>
    </div>
  );
}

export default App;
