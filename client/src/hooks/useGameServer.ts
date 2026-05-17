import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveStorageKey } from '../storage';
import { storageKeys } from '../utils/constants';
import type {
	DirectoryResponse,
	HistoryResponse,
	OnlineRoomAction,
	RoomDirectoryListing,
	RoomResponse,
	RoomViewState,
	UserRecord,
	UserResponse,
} from '../utils/types';

const apiBase = '/api';

function getStoredUserId(): number | null {
	if (typeof window === 'undefined') return null;

	const raw = window.localStorage.getItem(resolveStorageKey(storageKeys.serverUserId));
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as number;
		return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
	} catch {
		return null;
	}
}

function setStoredUserId(userId: number): void {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(resolveStorageKey(storageKeys.serverUserId), JSON.stringify(userId));
}

async function readJson<T>(response: Response): Promise<T> {
	const payload = (await response.json()) as T | { error: string };
	if (!response.ok) {
		const message =
			typeof payload === 'object' && payload !== null && 'error' in payload
				? String(payload.error)
				: `Request failed with ${response.status}`;
		throw new Error(message);
	}

	return payload as T;
}

export function useServerUser(name: string, enabled = true) {
	const [user, setUser] = useState<UserRecord | null>(null);
	const [userError, setUserError] = useState<string | null>(null);
	const desiredNameRef = useRef(name);
	desiredNameRef.current = name;

	const ensureUser = useCallback(async (): Promise<UserRecord | null> => {
		if (!enabled) return null;

		try {
			const payload = await readJson<UserResponse>(
				await fetch(`${apiBase}/users`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: getStoredUserId(), name: desiredNameRef.current }),
				}),
			);
			setStoredUserId(payload.user.id);
			setUser(payload.user);
			setUserError(null);
			return payload.user;
		} catch (error) {
			setUserError(error instanceof Error ? error.message : 'Unable to connect');
			return null;
		}
	}, [enabled]);

	useEffect(() => {
		void ensureUser();
	}, [ensureUser]);

	return { user, userError, ensureUser };
}

export function useRoomDirectory(enabled = true) {
	const [rooms, setRooms] = useState<RoomDirectoryListing[]>([]);

	const reloadDirectory = useCallback(async () => {
		if (!enabled) return;

		try {
			const payload = await readJson<DirectoryResponse>(
				await fetch(`${apiBase}/rooms`, { headers: { Accept: 'application/json' } }),
			);
			setRooms(payload.rooms);
		} catch {
			setRooms([]);
		}
	}, [enabled]);

	useEffect(() => {
		void reloadDirectory();
		if (!enabled) return;

		const interval = window.setInterval(() => void reloadDirectory(), 2500);
		return () => window.clearInterval(interval);
	}, [enabled, reloadDirectory]);

	return { rooms, reloadDirectory };
}

export function useGameHistory(enabled = true) {
	const [history, setHistory] = useState<HistoryResponse['games']>([]);

	const reloadHistory = useCallback(async () => {
		if (!enabled) return;

		try {
			const payload = await readJson<HistoryResponse>(
				await fetch(`${apiBase}/history`, { headers: { Accept: 'application/json' } }),
			);
			setHistory(payload.games);
		} catch {
			setHistory([]);
		}
	}, [enabled]);

	useEffect(() => {
		void reloadHistory();
	}, [reloadHistory]);

	return { history, reloadHistory };
}

export function useOnlineRoom(roomCode: string, playerName: string, enabled = true) {
	const { user, userError, ensureUser } = useServerUser(playerName, enabled);
	const [room, setRoom] = useState<RoomViewState | null>(null);
	const [roomError, setRoomError] = useState<string | null>(null);
	const joinedRoomRef = useRef<string | null>(null);

	const reloadRoom = useCallback(async (): Promise<RoomViewState | null> => {
		if (!enabled) return null;

		const currentUser = user ?? (await ensureUser());
		if (!currentUser) return null;

		try {
			const payload = await readJson<RoomResponse>(
				await fetch(`${apiBase}/rooms/${encodeURIComponent(roomCode)}?userId=${currentUser.id}`, {
					headers: { Accept: 'application/json' },
				}),
			);
			setRoom(payload.room);
			setRoomError(null);
			return payload.room;
		} catch (error) {
			setRoomError(error instanceof Error ? error.message : 'Unable to load room');
			return null;
		}
	}, [enabled, ensureUser, roomCode, user]);

	const joinRoom = useCallback(async (): Promise<RoomViewState | null> => {
		if (!enabled) return null;

		const currentUser = user ?? (await ensureUser());
		if (!currentUser) return null;

		try {
			const payload = await readJson<RoomResponse>(
				await fetch(`${apiBase}/rooms/${encodeURIComponent(roomCode)}/join`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: currentUser.id, name: playerName }),
				}),
			);
			setRoom(payload.room);
			joinedRoomRef.current = roomCode;
			setRoomError(null);
			return payload.room;
		} catch (error) {
			setRoomError(error instanceof Error ? error.message : 'Unable to join room');
			return null;
		}
	}, [enabled, ensureUser, playerName, roomCode, user]);

	useEffect(() => {
		if (!enabled) {
			setRoom(null);
			joinedRoomRef.current = null;
			return;
		}

		void joinRoom();
	}, [enabled, joinRoom]);

	useEffect(() => {
		if (!enabled || !user) return;

		const events = new EventSource(
			`${apiBase}/rooms/${encodeURIComponent(roomCode)}/events?userId=${encodeURIComponent(String(user.id))}`,
		);
		const updateRoom = (event: Event) => {
			try {
				const payload = JSON.parse((event as MessageEvent<string>).data) as RoomResponse;
				setRoom(payload.room);
				setRoomError(null);
			} catch {
				void reloadRoom();
			}
		};

		events.addEventListener('room', updateRoom);
		events.onmessage = updateRoom;
		events.onerror = () => void reloadRoom();
		return () => events.close();
	}, [enabled, reloadRoom, roomCode, user]);

	const sendAction = useCallback(
		async (action: OnlineRoomAction): Promise<RoomViewState | null> => {
			if (!enabled) return null;

			const currentUser = user ?? (await ensureUser());
			if (!currentUser) return null;

			try {
				const payload = await readJson<RoomResponse>(
					await fetch(`${apiBase}/rooms/${encodeURIComponent(roomCode)}/actions`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ userId: currentUser.id, action }),
					}),
				);
				setRoom(payload.room);
				setRoomError(null);
				return payload.room;
			} catch (error) {
				setRoomError(error instanceof Error ? error.message : 'Unable to update room');
				void reloadRoom();
				return null;
			}
		},
		[enabled, ensureUser, reloadRoom, roomCode, user],
	);

	return useMemo(
		() => ({ room, user, error: roomError ?? userError, joinRoom, reloadRoom, sendAction }),
		[joinRoom, reloadRoom, room, roomError, sendAction, user, userError],
	);
}
