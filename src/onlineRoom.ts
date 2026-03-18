import { proxy, subscribe } from 'valtio';

import { getScopedNetworkAppId } from './networkConstants';
import {
	applyOnlineRoomAction,
	buildRoomMembers,
	cloneLobbySettings,
	createInitialOnlineRoomState,
	sanitizePlayerName,
} from './onlineRoomShared';
import type {
	GameAction,
	LobbySettings,
	OnlineRoomAction,
	OnlineRoomState,
	RoomDirectoryListing,
	RoomPresencePlayer,
	RoomViewState,
} from './utils/types';
import Networking, { type PeerId, type RoomId, ownPeerId } from './utils/networking';

interface DirectoryState {
	status: 'connected';
	rooms: RoomDirectoryListing[];
}

interface CachedRoomState {
	v: number;
	hostPeerId: PeerId | null;
	hostPlayerId: string | null;
	game: OnlineRoomState;
}

interface OnlineRoomStoreLike {
	state: RoomViewState;
	directoryState: DirectoryState;
	syncRouteRoom: (roomCode: string | null) => void;
	joinRoom: (roomCode: string) => void;
	leaveRoom: () => void;
	setSelfName: (name: string) => void;
	toggleSelfSpectator: (next?: boolean) => void;
	updateSettings: (next: Partial<LobbySettings>) => void;
	startGame: () => void;
	sendGameAction: (action: GameAction) => void;
}

class OnlineRoomStore implements OnlineRoomStoreLike {
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private reconnectRoomId: RoomId | null = null;

	readonly state = proxy<RoomViewState>({
		status: 'idle',
		selfId: null,
		selfPlayerId: null,
		hostId: null,
		isHost: false,
		snapshotVersion: 0,
		phase: 'lobby',
		members: [],
		settings: cloneLobbySettings(),
		gameState: null,
	});

	readonly directoryState = proxy<DirectoryState>({
		status: 'connected',
		rooms: [],
	});

	readonly networking = new Networking<OnlineRoomState, OnlineRoomAction>({
		appId: getScopedNetworkAppId(),
		getNewGameState: createInitialOnlineRoomState,
		applyAction: (state, action) => {
			const roomId = this.networking.gameRoom?.roomId;
			const players = roomId ? this.getPresencePlayers(roomId) : [];
			const hostPeerId = this.networking.state.gameRoom.host;
			return applyOnlineRoomAction(state, action, {
				actorPlayerId: action.actorId,
				hostPlayerId: hostPeerId ? (this.networking.playerRoom.get(hostPeerId)?.id ?? null) : null,
				players,
			});
		},
	});

	constructor() {
		subscribe(this.networking.playerRoom.state, () => {
			this.syncState();
			this.syncDirectoryState();
		});
		subscribe(this.networking.state, () => {
			this.syncState();
			this.syncDirectoryState();
		});

		this.syncState();
		this.syncDirectoryState();
	}

	syncRouteRoom(roomCode: string | null): void {
		if (!roomCode) {
			this.leaveRoom();
			return;
		}

		this.joinRoom(roomCode);
	}

	joinRoom(roomCode: string): void {
		const roomId = `room:${roomCode}` as RoomId;
		if (this.networking.gameRoom?.roomId === roomId) {
			this.restoreCachedRoom(roomId);
			if (this.networking.state.gameRoom.ready || this.networking.state.gameRoom.host === ownPeerId) {
				this.syncState();
				return;
			}
		}

		this.networking.joinRoom({
			roomId,
			isHost: false,
		});
		this.restoreCachedRoom(roomId);
		this.syncState();
	}

	leaveRoom(): void {
		if (!this.networking.playerRoom.state.self.room) {
			this.syncState();
			return;
		}

		localStorage.removeItem(this.getRoomCacheKey(this.networking.playerRoom.state.self.room));
		this.networking.leaveRoom();
		this.syncState();
	}

	setSelfName(name: string): void {
		if (
			this.state.selfPlayerId &&
			this.state.phase === 'playing' &&
			this.state.gameState?.players.some(player => player.id === this.state.selfPlayerId)
		) {
			return;
		}

		const self = this.networking.playerRoom.state.self;
		const fallbackName = `Player ${self.id.slice(-4).toUpperCase()}`;
		const nextName = sanitizePlayerName(name) ?? fallbackName;
		if (self.name === nextName) {
			return;
		}

		this.networking.playerRoom.updateSelf({ name: nextName });
	}

	toggleSelfSpectator(next?: boolean): void {
		const selfPlayerId = this.state.selfPlayerId;
		if (!selfPlayerId || !this.networking.gameRoom) {
			return;
		}

		const current = this.state.members.find(member => member.id === selfPlayerId)?.isTv ?? false;
		const spectator = next ?? !current;
		this.networking.gameRoom.act({
			type: 'set-spectator',
			actorId: selfPlayerId,
			spectator,
		});
	}

	updateSettings(next: Partial<LobbySettings>): void {
		const selfPlayerId = this.state.selfPlayerId;
		if (!selfPlayerId || !this.networking.gameRoom) {
			return;
		}

		this.networking.gameRoom.act({
			type: 'set-settings',
			actorId: selfPlayerId,
			next,
		});
	}

	startGame(): void {
		const selfPlayerId = this.state.selfPlayerId;
		if (!selfPlayerId || !this.networking.gameRoom) {
			return;
		}

		this.networking.gameRoom.act({
			type: 'start-game',
			actorId: selfPlayerId,
		});
	}

	sendGameAction(action: GameAction): void {
		if (!this.networking.gameRoom) {
			return;
		}

		this.networking.gameRoom.act({
			type: 'game-action',
			actorId: action.actorId,
			action,
		});
	}

	private syncState(): void {
		const gameRoomState = this.networking.state.gameRoom;
		const currentRoomId = this.networking.playerRoom.state.self.room;
		const selfPlayerId = this.networking.playerRoom.state.self.id;
		const currentRoomPlayers = currentRoomId ? this.getPresencePlayers(currentRoomId) : [];
		const cachedRoom = currentRoomId ? this.readCachedRoom(currentRoomId) : null;
		const cachedHostPeerId: PeerId | null =
			cachedRoom && cachedRoom.game.phase === 'playing' && !gameRoomState.ready
				? ((currentRoomPlayers.find(player => player.id === cachedRoom.hostPlayerId)?.peerId as PeerId | undefined) ??
					cachedRoom.hostPeerId)
				: null;
		const projectedHostPeerId: PeerId | null =
			cachedHostPeerId && cachedRoom!.hostPlayerId !== selfPlayerId
				? cachedHostPeerId
				: cachedRoom && cachedRoom.game.phase === 'playing' && !gameRoomState.ready && currentRoomPlayers.length <= 1
					? cachedRoom.hostPlayerId === selfPlayerId
						? ownPeerId
						: cachedRoom.hostPeerId
					: ((currentRoomPlayers[0]?.peerId as PeerId | undefined) ?? gameRoomState.host ?? null);
		if (projectedHostPeerId !== gameRoomState.host) {
			gameRoomState.host = projectedHostPeerId;
		}
		if (
			cachedRoom &&
			cachedRoom.game.phase === 'playing' &&
			cachedRoom.hostPlayerId !== selfPlayerId &&
			!gameRoomState.ready
		) {
			gameRoomState.v = cachedRoom.v;
			gameRoomState.game = cachedRoom.game;
		}
		const hasRoomState = gameRoomState.ready || gameRoomState.host === ownPeerId;
		const preferCachedRoom = Boolean(
			cachedRoom &&
			cachedRoom.game.phase === 'playing' &&
			(!hasRoomState || (gameRoomState.game.phase === 'lobby' && currentRoomPlayers.length <= 1)),
		);
		const currentRoomSnapshot = preferCachedRoom
			? cachedRoom!.game
			: hasRoomState
				? gameRoomState.game
				: (cachedRoom?.game ?? null);
		const members = currentRoomId ? buildRoomMembers(currentRoomPlayers, currentRoomSnapshot?.spectatorIds ?? []) : [];
		const hostId = preferCachedRoom ? cachedRoom!.hostPeerId : (gameRoomState.host ?? cachedRoom?.hostPeerId ?? null);
		const isHost = preferCachedRoom ? cachedRoom!.hostPlayerId === selfPlayerId : gameRoomState.host === ownPeerId;

		this.state.selfId = ownPeerId;
		this.state.selfPlayerId = selfPlayerId;
		this.state.hostId = hostId;
		this.state.isHost = isHost;
		this.state.snapshotVersion = preferCachedRoom
			? cachedRoom!.v
			: hasRoomState
				? gameRoomState.v
				: (cachedRoom?.v ?? 0);
		this.state.phase = currentRoomSnapshot?.phase ?? 'lobby';
		this.state.members = members;
		this.state.settings = currentRoomSnapshot?.settings ?? cloneLobbySettings();
		this.state.gameState = currentRoomSnapshot?.gameState ?? null;
		this.state.status = currentRoomId ? (hasRoomState || isHost ? 'connected' : 'connecting') : 'idle';
		if (currentRoomId && hasRoomState && !preferCachedRoom) {
			const hostPlayerId = gameRoomState.host ? (this.networking.playerRoom.get(gameRoomState.host)?.id ?? null) : null;
			const shouldPersist =
				currentRoomSnapshot?.phase === 'playing' ||
				!cachedRoom ||
				cachedRoom.game.phase !== 'playing' ||
				gameRoomState.v > cachedRoom.v;
			if (!shouldPersist) {
				this.syncReconnect(currentRoomId);
				return;
			}

			localStorage.setItem(
				this.getRoomCacheKey(currentRoomId),
				JSON.stringify({
					v: gameRoomState.v,
					hostPeerId: gameRoomState.host,
					hostPlayerId,
					game: gameRoomState.game,
				} satisfies CachedRoomState),
			);
		}
		this.syncReconnect(currentRoomId);
	}

	private syncDirectoryState(): void {
		this.directoryState.rooms = this.networking.lobbies
			.map(room => ({
				code: room.id.slice('room:'.length),
				players: buildRoomMembers(
					(room.players ?? []).map(player => ({
						id: player.id,
						peerId: player.peerId,
						name: player.name,
					})),
					[],
				).map(player => player.name),
			}))
			.sort((left, right) => left.code.localeCompare(right.code));
	}

	private getPresencePlayers(roomId: RoomId): RoomPresencePlayer[] {
		return Object.values(this.networking.playerRoom.state.players)
			.filter(player => player.room === roomId)
			.sort((left, right) => left.id.localeCompare(right.id))
			.map(player => ({
				id: player.id,
				peerId: player.peerId,
				name: player.name,
			}));
	}

	private syncReconnect(roomId: RoomId | null) {
		if (!roomId || this.networking.state.gameRoom.ready || this.networking.state.gameRoom.host === ownPeerId) {
			if (this.reconnectTimeout !== null) {
				clearTimeout(this.reconnectTimeout);
				this.reconnectTimeout = null;
			}
			this.reconnectRoomId = null;
			return;
		}

		if (this.reconnectTimeout !== null && this.reconnectRoomId === roomId) {
			return;
		}

		if (this.reconnectTimeout !== null) {
			clearTimeout(this.reconnectTimeout);
		}

		this.reconnectRoomId = roomId;
		this.reconnectTimeout = setTimeout(() => {
			this.reconnectTimeout = null;
			const reconnectRoomId = this.reconnectRoomId;
			this.reconnectRoomId = null;
			if (
				!reconnectRoomId ||
				this.networking.playerRoom.state.self.room !== reconnectRoomId ||
				this.networking.state.gameRoom.ready ||
				this.networking.state.gameRoom.host === ownPeerId
			) {
				return;
			}

			this.networking.joinRoom({
				roomId: reconnectRoomId,
				isHost: false,
			});
			this.restoreCachedRoom(reconnectRoomId);
			this.syncState();
		}, 1500);
	}

	private getRoomCacheKey(roomId: RoomId) {
		return `online-room:${roomId}`;
	}

	private readCachedRoom(roomId: RoomId): CachedRoomState | null {
		const cached = localStorage.getItem(this.getRoomCacheKey(roomId));
		return cached ? (JSON.parse(cached) as CachedRoomState) : null;
	}

	private restoreCachedRoom(roomId: RoomId) {
		const cached = this.readCachedRoom(roomId);
		if (!cached) {
			return;
		}

		if (cached.hostPlayerId === this.networking.playerRoom.state.self.id) {
			this.networking.state.gameRoom.v = cached.v;
			this.networking.state.gameRoom.host = ownPeerId;
			this.networking.state.gameRoom.game = cached.game;
		}
	}
}

class OfflineOnlineRoomStore implements OnlineRoomStoreLike {
	readonly state = proxy<RoomViewState>({
		status: 'idle',
		selfId: null,
		selfPlayerId: null,
		hostId: null,
		isHost: false,
		snapshotVersion: 0,
		phase: 'lobby',
		members: [],
		settings: cloneLobbySettings(),
		gameState: null,
	});

	readonly directoryState = proxy<DirectoryState>({
		status: 'connected',
		rooms: [],
	});

	syncRouteRoom(roomCode: string | null): void {
		if (!roomCode) {
			this.leaveRoom();
			return;
		}

		this.state.status = 'connecting';
		this.state.phase = 'lobby';
		this.state.settings = cloneLobbySettings();
		this.state.gameState = null;
		this.state.members = [];
		this.state.snapshotVersion = 0;
	}

	joinRoom(roomCode: string): void {
		this.syncRouteRoom(roomCode);
	}

	leaveRoom(): void {
		this.state.status = 'idle';
		this.state.phase = 'lobby';
		this.state.members = [];
		this.state.gameState = null;
		this.state.snapshotVersion = 0;
	}

	setSelfName(_name: string): void {}

	toggleSelfSpectator(_next?: boolean): void {}

	updateSettings(_next: Partial<LobbySettings>): void {}

	startGame(): void {}

	sendGameAction(_action: GameAction): void {}
}

let onlineRoomSingleton: OnlineRoomStoreLike | null = null;

export function getOnlineRoom(): OnlineRoomStoreLike {
	if (!onlineRoomSingleton) {
		onlineRoomSingleton =
			typeof window !== 'undefined' && typeof globalThis.RTCPeerConnection !== 'undefined'
				? new OnlineRoomStore()
				: new OfflineOnlineRoomStore();
	}

	return onlineRoomSingleton;
}

export type {
	GameAction,
	LobbySettings,
	OnlineRoomAction,
	OnlineRoomState,
	RoomDirectoryListing,
	RoomMemberView,
	RoomViewState,
} from './utils/types';
