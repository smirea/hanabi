import type { ActionSender, ActionProgress, JsonValue } from 'trystero';

import { joinRoom as baseJoinRoom, selfId } from 'trystero/mqtt';
import { proxy } from 'valtio';

export type PeerId = string & { __brand: 'TrysteroPeerId' };
export type PlayerId = `player:${string}` & { __brand: 'PlayerId' };
export type RoomId = `room:${string}` & { __brand: 'RoomId' };

interface NetworkPlayer {
	/** defining custom stable ID that can be stored in localStorage since selfId is random on load */
	id: PlayerId;
	peerId: PeerId;
	name: string;
	room: RoomId | null;
}

interface ActionReceiver<T> {
	(receiver: (data: T, peerId: PeerId, metadata?: JsonValue) => void): void;
}

type JoinedRoom = ReturnType<typeof joinRoom>;
type TimerHandle = ReturnType<typeof setTimeout>;

export interface NetworkingRuntime {
	selfId: PeerId;
	joinRoom: typeof joinRoom;
	storage: Pick<Storage, 'getItem' | 'setItem'>;
	locationSearch: string;
	now: () => number;
	random: () => number;
	setTimeout: (handler: () => void, ms: number) => TimerHandle;
	clearTimeout: (timeout: TimerHandle) => void;
}

/** alias on top of `trystero.joinRoom()` with better types */
export const joinRoom = (...args: Parameters<typeof baseJoinRoom>) => {
	const base = baseJoinRoom(...args);
	return {
		...base,
		roomId: args[1] as RoomId,
		onPeerJoin: base.onPeerJoin as (fn: (peerId: PeerId) => void) => void,
		onPeerLeave: base.onPeerLeave as (fn: (peerId: PeerId) => void) => void,
		makeAction: base.makeAction as <T extends Record<string, any>>(
			namespace: string,
		) => [ActionSender<T>, ActionReceiver<T>, ActionProgress],
		ping: base.ping as (peerId: PeerId) => Promise<number>,
	};
};

const defaultRuntime: NetworkingRuntime = {
	selfId: selfId as PeerId,
	joinRoom,
	storage: {
		getItem(key) {
			return localStorage.getItem(key);
		},
		setItem(key, value) {
			localStorage.setItem(key, value);
		},
	},
	locationSearch: globalThis.location?.search ?? '',
	now: () => Date.now(),
	random: () => Math.random(),
	setTimeout: (handler, ms) => setTimeout(handler, ms),
	clearTimeout: timeout => clearTimeout(timeout),
};

export const ownPeerId = defaultRuntime.selfId;

export function createNetworkingRuntime(overrides: Partial<NetworkingRuntime> = {}): NetworkingRuntime {
	return {
		...defaultRuntime,
		...overrides,
	};
}

export default class Networking<
	const GameState extends Record<string, any>,
	const GameAction extends { type: string },
> {
	state: {
		/** we need to store the game room state in here to be able to easily pass it to valtio in react - valtio hooks do not accept null values because hooks are stupid */
		gameRoom: NetworkingGameRoom<GameState, GameAction>['state'];
	} = proxy({
		gameRoom: { ready: false } as any,
	});
	readonly playerRoom;
	gameRoom: null | NetworkingGameRoom<GameState, GameAction> = null;
	private readonly runtime: NetworkingRuntime;

	constructor(
		readonly config: {
			appId: string;
			getNewGameState: () => GameState;
			applyAction: (state: GameState, action: GameAction) => void;
		},
		runtimeOverrides: Partial<NetworkingRuntime> = {},
	) {
		this.runtime = createNetworkingRuntime(runtimeOverrides);
		this.playerRoom = new NetworkingPlayerRoom({ appId: this.config.appId, runtime: this.runtime });
		if (this.playerRoom.state.self.room) {
			this.joinRoom({
				roomId: this.playerRoom.state.self.room,
				isHost: false,
			});
		}
	}

	get lobbies() {
		const rooms = Object.groupBy(Object.values(this.playerRoom.state.players), x => x.room || 'no-room');
		delete rooms['no-room'];
		return Object.entries(rooms).map(([roomId, players]) => ({
			id: roomId as RoomId,
			players: players as NetworkPlayer[],
		}));
	}

	joinRoom({ roomId, isHost }: { roomId: RoomId; isHost: boolean }) {
		this.playerRoom.updateSelf({ room: roomId });
		this.gameRoom?.leave();
		this.state.gameRoom = {
			v: 0,
			ready: false,
			host: isHost ? this.runtime.selfId : null,
			game: this.config.getNewGameState(),
		};
		this.gameRoom = new NetworkingGameRoom<GameState, GameAction>({
			appId: this.config.appId,
			state: this.state.gameRoom,
			applyAction: this.config.applyAction,
			players: this.playerRoom,
			roomId,
			runtime: this.runtime,
		});
	}

	leaveRoom() {
		this.playerRoom.updateSelf({ room: null });
		this.gameRoom?.leave();
		this.gameRoom = null;
		this.state.gameRoom = { ready: false } as any;
	}
}

/**
 * many-to-many diff updates
 */
class NetworkingPlayerRoom {
	state: {
		self: NetworkPlayer;
		players: Record<PeerId, NetworkPlayer>;
	};
	private readonly room: JoinedRoom;
	private readonly runtime: NetworkingRuntime;
	private readonly storageKey: string;
	private sendPlayerUpdate;

	constructor({ appId, runtime }: { appId: string; runtime: NetworkingRuntime }) {
		this.runtime = runtime;
		const debugId = new URLSearchParams(this.runtime.locationSearch).get('debug_id') || '';
		this.storageKey = 'networking:player' + debugId;
		this.room = this.runtime.joinRoom({ appId }, 'players');
		const [sendPlayerUpdate, onPlayerUpdate] = this.room.makeAction<NetworkPlayer>('playerUpdate');
		this.sendPlayerUpdate = sendPlayerUpdate;
		this.state = proxy({
			self: {} as any,
			players: {},
		});
		this.updateSelf(
			this.runtime.storage.getItem(this.storageKey)
				? { ...JSON.parse(this.runtime.storage.getItem(this.storageKey)!), peerId: this.runtime.selfId }
				: {
						id: `player:${this.runtime.now() % 1e6}${this.runtime.random().toString().slice(-3)}` as PlayerId,
						peerId: this.runtime.selfId,
						name: 'unnamed',
						room: null,
					},
		);
		onPlayerUpdate((data, peerId) => {
			this.state.players[peerId] = data;
		});
		this.room.onPeerJoin(peerId => this.sendPlayerUpdate(this.state.self, [peerId]));
		this.room.onPeerLeave(peerId => {
			delete this.state.players[peerId];
		});
	}

	updateSelf(diff: Partial<NetworkPlayer>) {
		Object.assign(this.state.self, diff);
		this.runtime.storage.setItem(this.storageKey, JSON.stringify(this.state.self));
		this.state.players[this.runtime.selfId] = this.state.self;
		void this.sendPlayerUpdate(this.state.self);
	}

	getById(id: PlayerId) {
		return Object.values(this.state.players).find(p => p.id === id);
	}

	get(peerId: PeerId) {
		return this.state.players[peerId];
	}
}

/**
 * one-to-many with automatic host election
 */
class NetworkingGameRoom<const GameState extends Record<string, any>, const GameAction extends { type: string }> {
	public readonly roomId: RoomId;
	room;
	private readonly state;
	private sendUpdate;
	private sendAction;
	private applyAction;
	private players;
	private electionTimeout: TimerHandle;
	private readonly runtime: NetworkingRuntime;

	constructor({
		appId,
		roomId,
		applyAction,
		players,
		state,
		runtime,
	}: {
		appId: string;
		roomId: RoomId;
		applyAction: (state: GameState, action: GameAction) => void;
		players: NetworkingPlayerRoom;
		state: {
			v: number;
			ready: boolean;
			host: PeerId | null;
			game: GameState;
		};
		runtime: NetworkingRuntime;
	}) {
		this.state = state;
		this.roomId = roomId;
		this.players = players;
		this.applyAction = applyAction;
		this.runtime = runtime;
		this.room = this.runtime.joinRoom({ appId }, roomId);
		const [sendUpdate, onUpdate] = this.room.makeAction<Omit<typeof this.state, 'ready'>>('gameState');
		this.sendUpdate = sendUpdate;
		const [sendAction, onAction] = this.room.makeAction<GameAction>('gameAction');
		this.sendAction = sendAction;
		onUpdate(data => {
			if (this.isHost) return;
			if (this.state.v > data.v) return;
			Object.assign(this.state, data);
			this.state.ready = true;
		});
		onAction(action => {
			if (!this.isHost) return;
			this.act(action);
		});
		this.room.onPeerJoin(peerId => {
			if (this.isHost) this.sendHostUpdate([peerId]);
		});
		this.room.onPeerLeave(peerId => {
			if (peerId !== this.state.host) return;
			this.state.host = null;
			void this.runHostElection();
		});
		this.electionTimeout = this.runtime.setTimeout(
			() => {
				if (!this.state.host) void this.runHostElection();
			},
			500 + Math.round(this.runtime.random() * 100),
		);
	}

	get isHost() {
		return this.runtime.selfId === this.state.host;
	}

	act(action: GameAction) {
		if (this.isHost) {
			this.applyAction(this.state.game, action);
			this.sendHostUpdate();
		} else {
			this.applyAction(this.state.game, action); // optimistic update, will be overwritten when host broadcasts state
			this.state.v = Math.round((this.state.v + 1e-4) * 1e4) / 1e4;
			void this.sendAction(action);
		}
	}

	private sendHostUpdate(peers?: PeerId[]) {
		if (!this.isHost) throw new Error('only host can do this, this should not happen');
		++this.state.v;
		void this.sendUpdate(this.state, peers);
	}

	private async runHostElection() {
		const candidates = Object.values(this.players.state.players)
			.filter(x => x.room === this.roomId)
			.sort((a, b) => a.id.localeCompare(b.id))
			.map(x => x.peerId);
		if (this.state.host) candidates.unshift(this.state.host);
		if (!candidates.length) throw new Error('no candidates for host election, this should not happen');
		if (!candidates.find(p => p === this.runtime.selfId))
			throw new Error('you are not in the list of candidates, this should not happen');
		// keep going in order until you find someone alive or you're the host chief
		for (const peerId of candidates) {
			if (this.runtime.selfId === peerId) {
				this.state.host = this.runtime.selfId;
				this.sendHostUpdate();
				break;
			}
			try {
				await promiseTimeout(1000, this.room.ping(peerId), this.runtime);
				break;
			} catch {}
		}
	}

	leave() {
		void this.room.leave();
		this.runtime.clearTimeout(this.electionTimeout);
	}
}

function promiseTimeout<T>(
	ms: number,
	p: Promise<T>,
	runtime: Pick<NetworkingRuntime, 'setTimeout' | 'clearTimeout'>,
): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((_, reject) => {
			const timeout = runtime.setTimeout(() => reject('timed out'), ms);
			void p.finally(() => runtime.clearTimeout(timeout));
		}),
	]);
}
