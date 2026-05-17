import { storageKeys } from './utils/constants';
import type { StorageKey, StorageValueByKey } from './utils/types';

const STORAGE_PREFIX = 'hanabi.';
const DEBUG_ID_SEARCH_PARAM = 'debug_id';

export function resolveStorageKey(key: StorageKey): string {
	const base = `${STORAGE_PREFIX}${key}`;
	const debugId =
		typeof window === 'undefined'
			? null
			: new URLSearchParams(window.location.search).get(DEBUG_ID_SEARCH_PARAM)?.trim();
	const suffix = debugId ? `dbg-${encodeURIComponent(debugId.slice(0, 64))}` : null;
	if (!suffix) {
		return base;
	}

	return `${base}.${suffix}`;
}

export { storageKeys };
export type { StorageKey, StorageValueByKey };
