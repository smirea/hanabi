import { exampleGameState } from './game-state-example';
import { SUITS, CARD_NUMBERS, type Card, type Suit, type CardNumber } from './types';

const gameState = exampleGameState;
const roomCode = 'HNB-47';

const suitColors: Record<Suit, string> = {
  R: '#e64d5f',
  Y: '#f4c21b',
  G: '#2dc96d',
  B: '#4f8eff',
  W: '#a8b8cc',
  M: '#d46eb3'
};

const cardCopies: Record<CardNumber, number> = {
  1: 3,
  2: 2,
  3: 2,
  4: 2,
  5: 1
};

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

function App() {
  const currentPlayer = gameState.players[gameState.currentTurnPlayerIndex];
  const you = gameState.players.find((p) => p.id === 'you')!;
  const others = gameState.players.filter((p) => p.id !== 'you');

  return (
    <main className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">H</span>
          <div className="meta">
            <span className="room">{roomCode}</span>
            <span className="status">Connected</span>
          </div>
        </div>
        <div className="header-right">
          <span className="turn-label">Turn</span>
          <span className="turn-name">{currentPlayer.name}</span>
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat-val">{gameState.hintTokens}</span>
          <span className="stat-lbl">Hints</span>
        </div>
        <div className="stat danger">
          <span className="stat-val">{gameState.fuseTokensUsed}/3</span>
          <span className="stat-lbl">Fuses</span>
        </div>
        <div className="stat">
          <span className="stat-val">{gameState.drawDeck.length}</span>
          <span className="stat-lbl">Deck</span>
        </div>
      </section>

      <section className="fireworks">
        {SUITS.map((suit) => {
          const height = getFireworkHeight(suit);
          return (
            <div key={suit} className="tower" style={{ '--suit': suitColors[suit] } as React.CSSProperties}>
              <div className="tower-label">{suit}</div>
              <div className="tower-stack">
                {CARD_NUMBERS.map((num) => {
                  const isLit = num <= height;
                  const blocked = isBlocked(suit, num);
                  const remaining = getRemainingCount(suit, num);
                  return (
                    <div key={num} className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}>
                      <span className="peg-num">{blocked ? '✕' : num}</span>
                      <span className="peg-remaining">{remaining}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="players">
        {others.map((player) => {
          const isCurrentTurn = player.id === currentPlayer.id;

          return (
            <article key={player.id} className={`player ${isCurrentTurn ? 'active' : ''}`}>
              <header className="player-header">
                {isCurrentTurn && <span className="turn-arrow">▶</span>}
                <span className="player-name">{player.name}</span>
              </header>
              <div className="cards">
                {player.cards.map((cardId) => (
                  <CardView key={cardId} card={gameState.cards[cardId]!} hidden={false} />
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className="you-section">
        <header className="you-header">
          {you.id === currentPlayer.id && <span className="turn-arrow">▶</span>}
          <span className="you-name">Your hand</span>
        </header>
        <div className="you-cards">
          {you.cards.map((cardId) => (
            <CardView key={cardId} card={gameState.cards[cardId]!} hidden={true} small />
          ))}
        </div>
      </section>

      <section className="actions">
        <button type="button">Color</button>
        <button type="button">Number</button>
        <button type="button" className="primary">Play</button>
        <button type="button" className="danger">Discard</button>
      </section>
    </main>
  );
}

function CardView({ card, hidden, small }: { card: Card; hidden: boolean; small?: boolean }) {
  const knownColor = card.hints.color;
  const knownNumber = card.hints.number;
  const bgColor = hidden
    ? (knownColor ? suitColors[knownColor] : undefined)
    : suitColors[card.suit];

  const notColors = knownColor ? [] : card.hints.notColors;
  const notNumbers = knownNumber ? [] : card.hints.notNumbers;
  const hasHints = knownColor || knownNumber || notColors.length > 0 || notNumbers.length > 0;

  return (
    <div
      className={`card ${small ? 'small' : ''}`}
      style={{ '--card-bg': bgColor } as React.CSSProperties}
    >
      <div className="card-face">
        {hidden ? '?' : card.number}
      </div>
      {hasHints && (
        <div className="badges">
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
          {notColors.map((c) => (
            <span key={c} className="badge not-color" style={{ '--badge-color': suitColors[c] } as React.CSSProperties}>
              ✕
            </span>
          ))}
          {notNumbers.map((n) => (
            <span key={n} className="badge not-number">{n}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
