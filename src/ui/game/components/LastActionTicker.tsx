import { useEffect, useRef, useState, type ReactNode } from 'react';

export function LastActionTicker({ id, message }: { id: string; message: ReactNode }) {
  const [previous, setPrevious] = useState<ReactNode | null>(null);
  const [current, setCurrent] = useState<ReactNode>(message);
  const [currentId, setCurrentId] = useState(id);
  const [isTicking, setIsTicking] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (currentId === id) {
      return;
    }

    setPrevious(current);
    setCurrent(message);
    setCurrentId(id);
    setIsTicking(true);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setIsTicking(false);
      setPrevious(null);
    }, 320);
  }, [currentId, id, message]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span className={`last-action-ticker ${isTicking ? 'ticking' : ''}`}>
      {previous !== null && (
        <span className="last-action-message leaving" aria-hidden>
          {previous}
        </span>
      )}
      <span className={`last-action-message ${previous !== null ? 'entering' : ''}`}>
        {current}
      </span>
    </span>
  );
}
