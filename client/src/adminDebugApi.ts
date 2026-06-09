import type { GameHistoryEntry, RoomDirectoryListing } from './utils/types';

export interface AdminDebugGame extends GameHistoryEntry {
	id: string;
	startActionId: number;
	endActionId: number;
}

export interface AdminDebugUser {
	id: string;
	userId: number | null;
	name: string;
	gamesPlayed: number;
}

export interface AdminDebugSummary {
	rooms: RoomDirectoryListing[];
	users: AdminDebugUser[];
	games: AdminDebugGame[];
}

async function readJson<T>(response: Response): Promise<T> {
	const payload = (await response.json()) as T | { error: string };
	if (!response.ok) {
		const message =
			typeof payload === 'object' && payload !== null && 'error' in payload
				? String(payload.error)
				: `Admin request failed with ${response.status}`;
		throw new Error(message);
	}

	return payload as T;
}

async function postAdmin<T>(path: string, body: unknown): Promise<T> {
	return readJson<T>(
		await fetch(`/api/admin/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
	);
}

export async function loadAdminDebugSummary(): Promise<AdminDebugSummary> {
	return readJson<AdminDebugSummary>(
		await fetch('/api/admin/summary', { headers: { Accept: 'application/json' } }),
	);
}

export function deleteAdminRoom(roomCode: string): Promise<unknown> {
	return postAdmin('delete-room', { roomCode });
}

export function deleteAdminUser(input: {
	userId?: number | null;
	name?: string | null;
}): Promise<unknown> {
	return postAdmin('delete-user', input);
}

export function deleteAdminGame(gameId: string): Promise<unknown> {
	return postAdmin('delete-game', { gameId });
}
