import { storageKeys } from './utils/constants';
import type { StorageKey, StorageValueByKey } from './utils/types';

const STORAGE_PREFIX = 'hanabi.';
const DEBUG_ID_SEARCH_PARAM = 'debug_id';

export function currentDebugId(): string | null {
	if (typeof window === 'undefined') return null;

	const params = new URLSearchParams(window.location.search);
	for (const [key, value] of params) {
		if (key.toLowerCase() === DEBUG_ID_SEARCH_PARAM) {
			const debugId = value.trim();
			if (debugId) return debugId;
		}
	}

	return null;
}

export function resolveStorageKey(key: StorageKey): string {
	const base = `${STORAGE_PREFIX}${key}`;
	const debugId = currentDebugId();
	const suffix = debugId ? `dbg-${encodeURIComponent(debugId.slice(0, 64))}` : null;
	if (!suffix) {
		return base;
	}

	return `${base}.${suffix}`;
}

export { storageKeys };
export type { StorageKey, StorageValueByKey };
