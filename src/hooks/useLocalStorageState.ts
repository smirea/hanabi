import { useCallback, useState } from 'react';

function resolveInitialValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useLocalStorageState<T>(key: string, initialValue: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => resolveInitialValue(key, initialValue));

  const setStoredValue = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(prev) : next;

      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        }
      } catch {
      }

      return resolved;
    });
  }, [key]);

  return [value, setStoredValue];
}
