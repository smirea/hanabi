import type { StorageKey, StorageValueByKey } from '../storage';
import { useWebStorageState } from './useWebStorageState';

type SetStateAction<T> = T | ((prev: T) => T);

export function useLocalStorageState<K extends StorageKey>(
  key: K,
  initialValue: StorageValueByKey[K],
  namespace: string | null = null
): [StorageValueByKey[K], (next: SetStateAction<StorageValueByKey[K]>) => void] {
  return useWebStorageState('localStorage', key, initialValue, namespace);
}
