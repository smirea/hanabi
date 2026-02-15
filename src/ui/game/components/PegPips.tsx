const MAX_PEG_PIPS = 4;

export type PegPipState = 'filled' | 'hollow' | 'unused';

export function getPegPipStates(remaining: number, total: number): PegPipState[] {
  const clampedRemaining = Math.min(Math.max(remaining, 0), MAX_PEG_PIPS);
  const clampedTotal = Math.min(Math.max(total, 0), MAX_PEG_PIPS);

  return Array.from({ length: MAX_PEG_PIPS }, (_, index) => {
    if (index >= clampedTotal) return 'unused';
    if (index < clampedRemaining) return 'filled';
    return 'hollow';
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
