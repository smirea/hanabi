import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveStorageKey } from '../storage';
import type { SetStateAction, StorageKey, StorageValueByKey } from '../utils/types';

type StorageTarget = 'localStorage' | 'sessionStorage';

function readStoredValue<K extends StorageKey>(
	target: StorageTarget,
	storageKey: string,
	fallback: StorageValueByKey[K],
): StorageValueByKey[K] {
	if (typeof window === 'undefined') {
		return fallback;
	}

	try {
		const raw = window[target].getItem(storageKey);
		if (raw === null) {
			return fallback;
		}

		return JSON.parse(raw) as StorageValueByKey[K];
	} catch {
		return fallback;
	}
}

export function useWebStorageState<K extends StorageKey>(
	target: StorageTarget,
	key: K,
	initialValue: StorageValueByKey[K],
	namespace: string | null = null,
): [StorageValueByKey[K], (next: SetStateAction<StorageValueByKey[K]>) => void] {
	const storageKey = resolveStorageKey(key, namespace);
	const [value, setValue] = useState<StorageValueByKey[K]>(() => readStoredValue(target, storageKey, initialValue));
	const initialValueRef = useRef(initialValue);
	initialValueRef.current = initialValue;
	const storageKeyRef = useRef(storageKey);

	useEffect(() => {
		if (storageKeyRef.current === storageKey) {
			return;
		}

		storageKeyRef.current = storageKey;
		setValue(readStoredValue(target, storageKey, initialValueRef.current));
	}, [storageKey, target]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const onStorage = (event: StorageEvent): void => {
			if (event.key !== storageKey) {
				return;
			}

			setValue(readStoredValue(target, storageKey, initialValueRef.current));
		};

		window.addEventListener('storage', onStorage);
		return () => {
			window.removeEventListener('storage', onStorage);
		};
	}, [storageKey, target]);

	const setStoredValue = useCallback(
		(next: SetStateAction<StorageValueByKey[K]>) => {
			setValue(prev => {
				const resolved =
					typeof next === 'function' ? (next as (current: StorageValueByKey[K]) => StorageValueByKey[K])(prev) : next;

				try {
					if (typeof window !== 'undefined') {
						window[target].setItem(storageKey, JSON.stringify(resolved));
					}
				} catch {}

				return resolved;
			});
		},
		[storageKey, target],
	);

	return [value, setStoredValue];
}
