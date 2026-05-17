import { parseRoomCode } from './roomCodes';
import { storageKeys } from './utils/constants';
import { getDebugId, LS } from './utils/utils';

export interface AppSearch {
	room?: string;
	debug_id?: string;
}

export function withPersistentSearch(room?: string): AppSearch {
	const debugId = getDebugId() ?? undefined;

	const search: AppSearch = {};
	if (room !== undefined) search.room = room;
	if (debugId !== undefined) search.debug_id = debugId;
	return search;
}

export function getStoredRoomCode(): string | null {
	return parseRoomCode(LS.get(storageKeys.currentRoom) ?? '');
}

export function setStoredRoomCode(room: string): void {
	if (typeof window === 'undefined') return;

	const code = parseRoomCode(room);
	if (!code) return;

	LS.set({ [storageKeys.currentRoom]: code });
}

export function clearStoredRoomCode(): void {
	LS.delete(storageKeys.currentRoom);
}

export function resolveHomeRoom(searchRoom: string | undefined): string | null {
	return searchRoom?.trim() ? searchRoom : getStoredRoomCode();
}
