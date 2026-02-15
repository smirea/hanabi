import { Fire, LightbulbFilament } from '@phosphor-icons/react';
import { useMemo, type CSSProperties } from 'react';
import { CARD_NUMBERS, type GameLogEntry, type HanabiPerspectiveState, type PlayerId } from '../../../game';
import { suitColors } from '../constants';
import { PegPips, getPegPipStates } from '../components/PegPips';
import { getLogBadge, renderLogMessage } from '../utils/logFormatting';

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

export function EndgameOverlay({
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
