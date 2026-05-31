import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storageKeys } from '../utils/constants';
import { LS } from '../utils/utils';
import type {
	DirectoryResponse,
	HistoryResponse,
	OnlineRoomAction,
	RoomDirectoryListing,
	RoomResponse,
	RoomViewState,
	UserRecord,
	UserResponse,
	CurrentRoomResponse,
	VersionResponse,
} from '../utils/types';

const apiBase = '/api';

export function getStoredUserId(): number | null {
	const userId = LS.get(storageKeys.serverUserId);
	return typeof userId === 'number' && Number.isInteger(userId) && userId > 0 ? userId : null;
}

function setStoredUserId(userId: number): void {
	LS.set({ [storageKeys.serverUserId]: userId });
}

function formatVersionText(committedAt: string | null): string | null {
	if (!committedAt) return null;

	const date = new Date(committedAt);
	if (Number.isNaN(date.getTime())) return null;

	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const year = date.getFullYear();
	const hour = String(date.getHours()).padStart(2, '0');
	const minute = String(date.getMinutes()).padStart(2, '0');
	return `version ${month} ${day}, ${year} @ ${hour}:${minute}`;
}

function createClientKey(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getStoredClientKey(): string | null {
	const storedClientKey = readStoredClientKey();
	if (storedClientKey) return storedClientKey;

	const clientKey = createClientKey();
	LS.set({ [storageKeys.serverClientKey]: clientKey });
	return clientKey;
}

function readStoredClientKey(): string | null {
	const clientKey = LS.get(storageKeys.serverClientKey);
	return typeof clientKey === 'string' && clientKey.trim() ? clientKey : null;
}

export function useCurrentRoomResume(enabled = true) {
	const [roomCode, setRoomCode] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(enabled);

	useEffect(() => {
		let cancelled = false;

		async function loadCurrentRoom() {
			if (!enabled) {
				setRoomCode(null);
				setIsLoading(false);
				return;
			}

			const userId = getStoredUserId();
			const clientKey = readStoredClientKey();
			if (!userId && !clientKey) {
				setRoomCode(null);
				setIsLoading(false);
				return;
			}

			setIsLoading(true);
			try {
				const params = new URLSearchParams();
				if (userId) params.set('userId', String(userId));
				if (clientKey) params.set('clientKey', clientKey);
				const payload = await readJson<CurrentRoomResponse>(
					await fetch(`${apiBase}/users/current-room?${params.toString()}`, {
						headers: { Accept: 'application/json' },
					}),
				);
				if (!cancelled) setRoomCode(payload.roomCode);
			} catch {
				if (!cancelled) setRoomCode(null);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		void loadCurrentRoom();
		return () => {
			cancelled = true;
		};
	}, [enabled]);

	return { roomCode, isLoading };
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

export function useAppVersion(enabled = true) {
	const [versionText, setVersionText] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function loadVersion() {
			if (!enabled) {
				setVersionText(null);
				return;
			}

			try {
				const payload = await readJson<VersionResponse>(
					await fetch(`${apiBase}/version`, { headers: { Accept: 'application/json' } }),
				);
				if (!cancelled) setVersionText(formatVersionText(payload.committedAt));
			} catch {
				if (!cancelled) setVersionText(null);
			}
		}

		void loadVersion();
		return () => {
			cancelled = true;
		};
	}, [enabled]);

	return { versionText };
}

export function useServerUser(name: string, enabled = true) {
	const [user, setUser] = useState<UserRecord | null>(null);
	const [userError, setUserError] = useState<string | null>(null);
	const userRef = useRef<UserRecord | null>(null);
	const inFlightRef = useRef<Promise<UserRecord | null> | null>(null);
	const desiredNameRef = useRef(name);
	desiredNameRef.current = name;
	userRef.current = user;

	const ensureUser = useCallback(async (): Promise<UserRecord | null> => {
		if (!enabled) return null;
		if (inFlightRef.current) return inFlightRef.current;

		inFlightRef.current = (async () => {
			const payload = await readJson<UserResponse>(
				await fetch(`${apiBase}/users`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						userId: userRef.current?.id ?? getStoredUserId(),
						clientKey: getStoredClientKey(),
						name: desiredNameRef.current,
					}),
				}),
			);
			setStoredUserId(payload.user.id);
			setUser(payload.user);
			setUserError(null);
			return payload.user;
		})();

		try {
			return await inFlightRef.current;
		} catch (error) {
			setUserError(error instanceof Error ? error.message : 'Unable to connect');
			return null;
		} finally {
			inFlightRef.current = null;
		}
	}, [enabled]);

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
	const [wasKicked, setWasKicked] = useState(false);
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
					body: JSON.stringify({
						userId: currentUser.id,
						clientKey: getStoredClientKey(),
						name: playerName,
					}),
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
			setWasKicked(false);
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
		const handleKick = () => {
			setWasKicked(true);
			setRoom(null);
			setRoomError(null);
			events.close();
		};
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
		events.addEventListener('room-deleted', handleKick);
		events.addEventListener('user-deleted', handleKick);
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
		() => ({
			room,
			user,
			error: roomError ?? userError,
			wasKicked,
			joinRoom,
			reloadRoom,
			sendAction,
		}),
		[joinRoom, reloadRoom, room, roomError, sendAction, user, userError, wasKicked],
	);
}
