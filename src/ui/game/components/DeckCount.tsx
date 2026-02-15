import { useEffect, useRef, useState } from 'react';

export function DeckCount({ value }: { value: number }) {
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastValueRef = useRef<number>(value);

  useEffect(() => {
    const last = lastValueRef.current;
    if (last === value) {
      return;
    }

    lastValueRef.current = value;
    setPreviousValue(last);
    setDirection(value > last ? 'up' : 'down');

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setPreviousValue(null);
      setDirection(null);
    }, 260);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const ticking = previousValue !== null && direction !== null;

  return (
    <span
      className={`deck-count ${ticking ? `deck-count-tick ${direction}` : ''}`}
      data-testid="status-deck-count"
      aria-label={`Deck ${value}`}
    >
      {ticking ? (
        <>
          <span className="deck-count-value prev" aria-hidden>{previousValue}</span>
          <span className="deck-count-value next">{value}</span>
        </>
      ) : (
        <span className="deck-count-value single">{value}</span>
      )}
    </span>
  );
}
