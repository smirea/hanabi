import { CardsThree, Fire, LightbulbFilament } from '@phosphor-icons/react';
import { useMemo, type CSSProperties } from 'react';
import { CARD_NUMBERS, type HanabiState, type PerspectiveCard, type Suit } from '../../../game';
import type { OnlineState } from '../../../network';
import { suitColors } from '../constants';
import { CardView } from '../components/CardView';
import { PegPips, getPegPipStates } from '../components/PegPips';
import { getLogBadge, renderLogMessage } from '../utils/logFormatting';

export function TvScreen({
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
                    const cardKey = `${suit}-${num}`;
                    const totalCopies = remaining + knownUnavailable;
                    const discarded = discardCounts.get(cardKey) ?? 0;
                    const played = num <= height ? 1 : 0;
                    const pipTotal = remaining + played + discarded;
                    const blocked = num > height && discarded >= totalCopies;
                    const pipStates = getPegPipStates(remaining, played, discarded, pipTotal);

                    return (
                      <div
                        key={num}
                        className={`peg ${isLit ? 'lit' : ''} ${blocked ? 'blocked' : ''}`}
                        data-testid={`tv-peg-${suit}-${num}`}
                      >
                        <span className="peg-num">{blocked ? '✕' : num}</span>
                        <span className="peg-pips" aria-label={`${remaining} hidden from TV, ${played} played, ${discarded} discarded`}>
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
