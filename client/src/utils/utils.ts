import { storageKeys } from './constants';
import createLocalStorage from './createLocalStorage';
import type { StorageKey, StorageValueByKey } from './types';

const LEGACY_STORAGE_PREFIX = 'hanabi.';
const searchParams =
	typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

export const DEBUG_ID = searchParams.get('DEBUG_ID') || searchParams.get('debug_id') || null;

export function getDebugId(): string | null {
	return DEBUG_ID;
}

const storageNamespace = `hanabi${DEBUG_ID ? `-DEBUG_ID=${DEBUG_ID}` : ''}`;

function legacyStorageKey(key: StorageKey): string {
	const base = `${LEGACY_STORAGE_PREFIX}${key}`;
	const suffix = DEBUG_ID ? `dbg-${encodeURIComponent(DEBUG_ID.slice(0, 64))}` : null;
	return suffix ? `${base}.${suffix}` : base;
}

function readLegacyValue<K extends StorageKey>(key: K): StorageValueByKey[K] | undefined {
	if (typeof window === 'undefined') return undefined;

	const raw = window.localStorage.getItem(legacyStorageKey(key));
	if (raw === null) return undefined;

	try {
		return JSON.parse(raw) as StorageValueByKey[K];
	} catch {
		return raw as StorageValueByKey[K];
	}
}

function getDefaults(): Partial<StorageValueByKey> {
	const defaults: Partial<StorageValueByKey> = {
		[storageKeys.debugMode]: false,
		[storageKeys.playerName]: '',
		[storageKeys.serverUserId]: null,
		[storageKeys.currentRoom]: null,
		[storageKeys.darkMode]: false,
		[storageKeys.negativeColorHints]: true,
		[storageKeys.negativeNumberHints]: true,
		[storageKeys.turnSoundEnabled]: true,
		[storageKeys.tibiMode]: false,
		[storageKeys.tvMode]: false,
	};

	for (const key of Object.values(storageKeys)) {
		const legacyValue = readLegacyValue(key);
		if (legacyValue !== undefined) {
			defaults[key] = legacyValue as never;
		}
	}

	return defaults;
}

export const { LS, useLocalStorage } = createLocalStorage<StorageValueByKey>({
	namespace: storageNamespace,
	getDefaults,
});
