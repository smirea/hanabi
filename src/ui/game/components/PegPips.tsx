const MAX_PEG_PIPS = 4;

export type PegPipState = 'filled' | 'half' | 'hollow' | 'unused';

export function getPegPipStates(
  hiddenCount: number,
  inHandCount: number,
  discardedCount: number,
  total: number
): PegPipState[] {
  const clampedTotal = Math.min(Math.max(total, 0), MAX_PEG_PIPS);
  const clampedHidden = Math.min(Math.max(hiddenCount, 0), clampedTotal);
  const clampedInHand = Math.min(Math.max(inHandCount, 0), Math.max(0, clampedTotal - clampedHidden));
  const clampedDiscarded = Math.min(
    Math.max(discardedCount, 0),
    Math.max(0, clampedTotal - clampedHidden - clampedInHand)
  );

  return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
    if (index >= clampedTotal) return 'unused';
    if (index < clampedHidden) return 'filled';
    if (index < clampedHidden + clampedInHand) return 'half';
    if (index < clampedHidden + clampedInHand + clampedDiscarded) return 'hollow';
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
