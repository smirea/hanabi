import { parseRoomCode } from './roomCodes';
import { currentDebugId, resolveStorageKey } from './storage';
import { storageKeys } from './utils/constants';

export interface AppSearch {
	room?: string;
	debug_id?: string;
}

export function withPersistentSearch(room?: string): AppSearch {
	const debugId = currentDebugId() ?? undefined;

	const search: AppSearch = {};
	if (room !== undefined) search.room = room;
	if (debugId !== undefined) search.debug_id = debugId;
	return search;
}

export function getStoredRoomCode(): string | null {
	if (typeof window === 'undefined') return null;

	const raw = window.localStorage.getItem(resolveStorageKey(storageKeys.currentRoom));
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as unknown;
		return typeof parsed === 'string' ? parseRoomCode(parsed) : null;
	} catch {
		return parseRoomCode(raw);
	}
}

export function setStoredRoomCode(room: string): void {
	if (typeof window === 'undefined') return;

	const code = parseRoomCode(room);
	if (!code) return;

	window.localStorage.setItem(resolveStorageKey(storageKeys.currentRoom), JSON.stringify(code));
}

export function clearStoredRoomCode(): void {
	if (typeof window === 'undefined') return;

	window.localStorage.removeItem(resolveStorageKey(storageKeys.currentRoom));
}

export function resolveHomeRoom(searchRoom: string | undefined): string | null {
	return searchRoom?.trim() ? searchRoom : getStoredRoomCode();
}
