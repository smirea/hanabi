import { useCallback, useState } from 'react';
import { parseStoredValue, resolveStorageKey, type StorageKey, type StorageValueByKey } from '../storage';

type SetStateAction<T> = T | ((prev: T) => T);

function resolveInitialValue<K extends StorageKey>(
  key: K,
  storageKey: string,
  fallback: StorageValueByKey[K]
): StorageValueByKey[K] {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      return fallback;
    }

    const parsed = parseStoredValue(key, raw);
    if (parsed === null) {
      return fallback;
    }

    return parsed;
  } catch {
    return fallback;
  }
}

export function useLocalStorageState<K extends StorageKey>(
  key: K,
  initialValue: StorageValueByKey[K],
  namespace: string | null = null
): [StorageValueByKey[K], (next: SetStateAction<StorageValueByKey[K]>) => void] {
  const storageKey = resolveStorageKey(key, namespace);
  const [value, setValue] = useState<StorageValueByKey[K]>(() => resolveInitialValue(key, storageKey, initialValue));

  const setStoredValue = useCallback((next: SetStateAction<StorageValueByKey[K]>) => {
    setValue((prev) => {
      const resolved = typeof next === 'function'
        ? (next as (current: StorageValueByKey[K]) => StorageValueByKey[K])(prev)
        : next;

      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, JSON.stringify(resolved));
        }
      } catch {
      }

      return resolved;
    });
  }, [storageKey]);

  return [value, setStoredValue];
}
