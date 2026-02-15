import type { StorageKey, StorageValueByKey } from '../storage';
import { useWebStorageState } from './useWebStorageState';

type SetStateAction<T> = T | ((prev: T) => T);

export function useSessionStorageState<K extends StorageKey>(
  key: K,
  initialValue: StorageValueByKey[K],
  namespace: string | null = null
): [StorageValueByKey[K], (next: SetStateAction<StorageValueByKey[K]>) => void] {
  return useWebStorageState('sessionStorage', key, initialValue, namespace);
}
