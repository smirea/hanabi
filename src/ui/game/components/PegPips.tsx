const MAX_PEG_PIPS = 4;

export type PegPipState = 'filled' | 'hollow' | 'unused';

export function getPegPipStates(
  notDiscardedCount: number,
  discardedCount: number,
  total: number
): PegPipState[] {
  const clampedTotal = Math.min(Math.max(total, 0), MAX_PEG_PIPS);
  const clampedNotDiscarded = Math.min(Math.max(notDiscardedCount, 0), clampedTotal);
  const clampedDiscarded = Math.min(
    Math.max(discardedCount, 0),
    Math.max(0, clampedTotal - clampedNotDiscarded)
  );

  return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
    if (index >= clampedTotal) return 'unused';
    if (index < clampedNotDiscarded) return 'filled';
    if (index < clampedNotDiscarded + clampedDiscarded) return 'hollow';
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
