import type { CSSProperties } from 'react';
import type { Suit } from '../../../game';
import { suitBadgeForeground, suitColors, suitNames } from '../constants';
import { SuitSymbol } from './SuitSymbol';

export function LogCardChip({ suit, number }: { suit: Suit; number: number }) {
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

export function LogHintChipNumber({ number }: { number: number }) {
  return (
    <span className="log-chip log-chip-number" aria-label={`number ${number}`}>
      {number}
    </span>
  );
}

export function LogHintChipSuit({ suit }: { suit: Suit }) {
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
