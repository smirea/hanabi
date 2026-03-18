import { storageKeys } from './utils/constants';
import type { StorageKey, StorageValueByKey } from './utils/types';

const STORAGE_PREFIX = 'hanabi.';
const SESSION_HASH_PREFIX = '#session_';

export function getSessionIdFromHash(hash: string): string | null {
	if (typeof hash !== 'string') {
		return null;
	}

	if (!hash.startsWith(SESSION_HASH_PREFIX)) {
		return null;
	}

	const value = hash.slice(1).trim();
	if (value.length <= SESSION_HASH_PREFIX.length - 1) {
		return null;
	}

	return value.slice(0, 64);
}

export function createSessionNamespace(sessionId: string): string {
	const trimmed = sessionId.trim();
	if (trimmed.length === 0) {
		throw new Error('Session namespace requires a non-empty id');
	}

	return `sess-${encodeURIComponent(trimmed)}`;
}

export function resolveStorageKey(key: StorageKey, namespace?: string | null): string {
	const base = `${STORAGE_PREFIX}${key}`;
	if (!namespace) {
		return base;
	}

	return `${base}.${namespace}`;
}

export { storageKeys };
export type { StorageKey, StorageValueByKey };
