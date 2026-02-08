type Suit = 'R' | 'Y' | 'G' | 'B' | 'W' | 'M';

type HintMeta = {
  knownColor: Suit | null;
  knownValue: 1 | 2 | 3 | 4 | 5 | null;
  excludedColors: Suit[];
  excludedValues: Array<1 | 2 | 3 | 4 | 5>;
  recentlyHinted: boolean;
};

type Card = {
  id: string;
  suit: Suit;
  value: 1 | 2 | 3 | 4 | 5;
  hidden: boolean;
  hint: HintMeta;
};

type Player = {
  id: string;
  name: string;
  isCurrentTurn: boolean;
  cards: Card[];
};

const suitColors: Record<Suit, string> = {
  R: '#d7263d',
  Y: '#f1c40f',
  G: '#2db44a',
  B: '#2f7cf6',
  W: '#cfd5de',
  M: '#ff62b0'
};

const players: Player[] = [
  {
    id: 'you',
    name: 'You',
    isCurrentTurn: true,
    cards: [
      {
        id: 'you-0',
        suit: 'R',
        value: 2,
        hidden: true,
        hint: {
          knownColor: 'R',
          knownValue: null,
          excludedColors: ['Y', 'G'],
          excludedValues: [1, 5],
          recentlyHinted: true
        }
      },
      {
        id: 'you-1',
        suit: 'B',
        value: 1,
        hidden: true,
        hint: {
          knownColor: null,
          knownValue: 1,
          excludedColors: ['R'],
          excludedValues: [4, 5],
          recentlyHinted: false
        }
      },
      {
        id: 'you-2',
        suit: 'W',
        value: 3,
        hidden: true,
        hint: {
          knownColor: null,
          knownValue: null,
          excludedColors: ['R', 'B', 'G'],
          excludedValues: [1, 2],
          recentlyHinted: false
        }
      },
      {
        id: 'you-3',
        suit: 'G',
        value: 4,
        hidden: true,
        hint: {
          knownColor: 'G',
          knownValue: 4,
          excludedColors: [],
          excludedValues: [],
          recentlyHinted: false
        }
      }
    ]
  },
  {
    id: 'p2',
    name: 'Kai',
    isCurrentTurn: false,
    cards: [
      {
        id: 'p2-0',
        suit: 'Y',
        value: 1,
        hidden: false,
        hint: {
          knownColor: 'Y',
          knownValue: 1,
          excludedColors: [],
          excludedValues: [],
          recentlyHinted: true
        }
      },
      {
        id: 'p2-1',
        suit: 'B',
        value: 3,
        hidden: false,
        hint: {
          knownColor: null,
          knownValue: 3,
          excludedColors: ['R'],
          excludedValues: [1],
          recentlyHinted: false
        }
      },
      {
        id: 'p2-2',
        suit: 'R',
        value: 2,
        hidden: false,
        hint: {
          knownColor: 'R',
          knownValue: null,
          excludedColors: ['B'],
          excludedValues: [5],
          recentlyHinted: false
        }
      },
      {
        id: 'p2-3',
        suit: 'W',
        value: 5,
        hidden: false,
        hint: {
          knownColor: null,
          knownValue: null,
          excludedColors: ['Y', 'G'],
          excludedValues: [2, 3],
          recentlyHinted: false
        }
      }
    ]
  }
];

const fireworks: Array<{ suit: Suit; top: number }> = [
  { suit: 'R', top: 1 },
  { suit: 'Y', top: 0 },
  { suit: 'G', top: 2 },
  { suit: 'B', top: 3 },
  { suit: 'W', top: 1 }
];

function App() {
  return (
    <main className="app" data-testid="app-shell">
      <section className="section header" data-testid="header-strip">
        <div className="header-item" data-testid="room-code">Room HNB-47</div>
        <div className="header-item" data-testid="connection-status">Connected</div>
        <div className="header-item" data-testid="turn-status">Your turn</div>
        <div className="header-item" data-testid="deck-count">Deck 27</div>
      </section>

      <section className="section board" data-testid="board-strip">
        <div className="token-panel" data-testid="hint-tokens">
          <h2>Hints</h2>
          <strong>6 / 8</strong>
        </div>
        <div className="token-panel" data-testid="fuse-tokens">
          <h2>Fuses</h2>
          <strong>1 / 3 used</strong>
        </div>
        <div className="fireworks" data-testid="fireworks-strip">
          {fireworks.map((stack) => (
            <div
              key={stack.suit}
              className="firework"
              style={{ borderColor: suitColors[stack.suit] }}
              data-testid={`firework-${stack.suit}`}
            >
              <span>{stack.suit}</span>
              <strong>{stack.top}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="section players" data-testid="player-lanes">
        {players.map((player) => (
          <article
            key={player.id}
            className={`player-lane ${player.isCurrentTurn ? 'current-turn' : ''}`}
            data-testid={`player-${player.id}`}
          >
            <header className="lane-header">
              <h2>{player.name}</h2>
              <span>{player.isCurrentTurn ? 'Active' : 'Waiting'}</span>
            </header>
            <div className="cards" data-testid={`cards-${player.id}`}>
              {player.cards.map((card, index) => (
                <CardView key={card.id} card={card} playerId={player.id} index={index} />
              ))}
            </div>
          </article>
        ))}
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

function CardView({ card, playerId, index }: { card: Card; playerId: string; index: number }) {
  const knownColor = card.hint.knownColor;

  return (
    <div
      className={`card ${card.hint.recentlyHinted ? 'recent-hint' : ''}`}
      style={{ borderColor: knownColor ? suitColors[knownColor] : '#546172' }}
      data-testid={`card-${playerId}-${index}`}
    >
      <div className="card-main" data-testid={`card-face-${playerId}-${index}`}>
        {card.hidden ? '??' : `${card.suit}${card.value}`}
      </div>
      <div className="hint-row" data-testid={`card-hints-${playerId}-${index}`}>
        <span className="chip" data-testid={`card-known-color-${playerId}-${index}`}>
          {card.hint.knownColor ? `C:${card.hint.knownColor}` : 'C:?'}
        </span>
        <span className="chip" data-testid={`card-known-value-${playerId}-${index}`}>
          {card.hint.knownValue ? `V:${card.hint.knownValue}` : 'V:?'}
        </span>
      </div>
      <div className="excluded-row" data-testid={`card-exclusions-${playerId}-${index}`}>
        {card.hint.excludedColors.map((excludedColor) => (
          <span key={excludedColor} className="chip muted" data-testid={`card-excluded-color-${playerId}-${index}-${excludedColor}`}>
            x{excludedColor}
          </span>
        ))}
        {card.hint.excludedValues.map((excludedValue) => (
          <span key={excludedValue} className="chip muted" data-testid={`card-excluded-value-${playerId}-${index}-${excludedValue}`}>
            x{excludedValue}
          </span>
        ))}
      </div>
    </div>
  );
}

export default App;
