import { CardsThree, HandPalm } from '@phosphor-icons/react';

const MAX_PEG_PIPS = 4;

export type PegPipState = 'filled' | 'hollow' | 'cross' | 'deck' | 'hand' | 'unused';
export type PegPipMode = 'default' | 'tibi';

export function getPegPipStates(
  mode: PegPipMode,
  hiddenCount: number,
  visibleCount: number,
  discardedCount: number,
  playedCount: number,
  total: number
): PegPipState[] {
  const clampedTotal = Math.min(Math.max(total, 0), MAX_PEG_PIPS);

  if (mode === 'tibi') {
    const clampedDeck = Math.min(Math.max(hiddenCount, 0), clampedTotal);
    const clampedHand = Math.min(Math.max(visibleCount, 0), Math.max(0, clampedTotal - clampedDeck));
    const clampedDiscarded = Math.min(
      Math.max(discardedCount, 0),
      Math.max(0, clampedTotal - clampedDeck - clampedHand)
    );

    return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
      if (index >= clampedTotal) return 'unused';
      if (index < clampedDeck) return 'deck';
      if (index < clampedDeck + clampedHand) return 'hand';
      if (index < clampedDeck + clampedHand + clampedDiscarded) return 'cross';
      return 'unused';
    });
  }

  const availableCount = Math.max(0, hiddenCount + visibleCount);
  const unavailableCount = Math.max(0, discardedCount + playedCount);
  const clampedAvailable = Math.min(availableCount, clampedTotal);
  const clampedUnavailable = Math.min(unavailableCount, Math.max(0, clampedTotal - clampedAvailable));

  return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
    if (index >= clampedTotal) return 'unused';
    if (index < clampedAvailable) return 'filled';
    if (index < clampedAvailable + clampedUnavailable) return 'hollow';
    return 'unused';
  });
}

export function PegPips({ pipStates }: { pipStates: PegPipState[] }) {
  const visible = pipStates
    .map((state, index) => ({ state, index }))
    .filter((pip) => pip.state !== 'unused');

  if (visible.length === 0) {
    return null;
  }

  return (
    <>
      {[...visible].reverse().map((pip) => (
        <span key={`pip-${pip.index}`} className={`peg-pip ${pip.state}`} aria-hidden>
          {pip.state === 'deck' && <CardsThree size={9} weight="bold" className="peg-pip-icon" aria-hidden />}
          {pip.state === 'hand' && <HandPalm size={9} weight="bold" className="peg-pip-icon" aria-hidden />}
        </span>
      ))}
    </>
  );
}
