const MAX_PEG_PIPS = 4;

export type PegPipState = 'filled' | 'hollow' | 'cross' | 'unused';

export function getPegPipStates(
  notVisibleCount: number,
  visibleCount: number,
  discardedCount: number,
  total: number
): PegPipState[] {
  const clampedTotal = Math.min(Math.max(total, 0), MAX_PEG_PIPS);
  const clampedNotVisible = Math.min(Math.max(notVisibleCount, 0), clampedTotal);
  const clampedVisible = Math.min(Math.max(visibleCount, 0), Math.max(0, clampedTotal - clampedNotVisible));
  const clampedDiscarded = Math.min(
    Math.max(discardedCount, 0),
    Math.max(0, clampedTotal - clampedNotVisible - clampedVisible)
  );

  return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
    if (index >= clampedTotal) return 'unused';
    if (index < clampedNotVisible) return 'filled';
    if (index < clampedNotVisible + clampedVisible) return 'hollow';
    if (index < clampedNotVisible + clampedVisible + clampedDiscarded) return 'cross';
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
        <span key={`pip-${pip.index}`} className={`peg-pip ${pip.state}`} aria-hidden />
      ))}
    </>
  );
}
