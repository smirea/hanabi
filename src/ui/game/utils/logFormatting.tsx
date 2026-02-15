import type { ReactNode } from 'react';
import type { GameLogEntry } from '../../../game';
import { LogCardChip, LogHintChipNumber, LogHintChipSuit } from '../components/LogChips';

export function renderLogMessage(log: GameLogEntry): ReactNode {
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

export function getLogBadge(log: GameLogEntry): string {
  if (log.type === 'hint') return 'Hint';
  if (log.type === 'play') return 'Play';
  if (log.type === 'discard') return 'Discard';
  if (log.type === 'draw') return 'Draw';
  return 'Status';
}
