import type { CSSProperties } from 'react';
import type { PerspectiveCard } from '../../../game';
import type { Suit } from '../../../game';
import { suitBadgeForeground, suitColors } from '../constants';
import { SuitSymbol } from './SuitSymbol';

export function CardView({
  card,
  showNegativeColorHints,
  showNegativeNumberHints,
  onSelect,
  isDisabled = false,
  isRedundantPlayArmed = false,
  testId,
  onNode
}: {
  card: PerspectiveCard;
  showNegativeColorHints: boolean;
  showNegativeNumberHints: boolean;
  onSelect?: () => void;
  isDisabled?: boolean;
  isRedundantPlayArmed?: boolean;
  testId: string;
  onNode?: (node: HTMLButtonElement | null) => void;
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
      className={`card ${card.hints.recentlyHinted ? 'recent' : ''} ${isRedundantPlayArmed ? 'redundant-play-armed' : ''}`}
      style={{ '--card-bg': bgColor } as CSSProperties}
      onClick={isDisabled ? undefined : onSelect}
      data-testid={testId}
      data-card-id={card.id}
      ref={onNode}
      disabled={isDisabled}
      aria-disabled={isDisabled}
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
