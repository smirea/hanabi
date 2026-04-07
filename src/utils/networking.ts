import type { ActionSender, ActionProgress, JsonValue } from 'trystero';

import { joinRoom as baseJoinRoom, selfId } from 'trystero/mqtt';
import { proxy, snapshot } from 'valtio';
import { LS } from './utils';

export type PeerId = string & { __brand: 'TrysteroPeerId' };
export type PlayerId = `player:${string}` & { __brand: 'PlayerId' };
export type RoomId = `room:${string}` & { __brand: 'RoomId' };

export interface NetworkPlayer {
	/** defining custom stable ID that can be stored in localStorage since selfId is random on load */
	id: PlayerId;
	peerId: PeerId;
	name: string;
	room: RoomId | null;
	isHost: boolean;
}

interface ActionReceiver<T> {
	(receiver: (data: T, peerId: PeerId, metadata?: JsonValue) => void): void;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface NetworkingRuntime {
	ownPeerId: PeerId;
	joinRoom: typeof joinRoom;
	storage: {
		get: () => NetworkPlayer | null;
		set: (player: NetworkPlayer) => void;
	};
	now: () => number;
	random: () => number;
	urlSearch: string;
	setTimeout: (handler: () => void, ms: number) => TimerHandle;
	clearTimeout: (timeout: TimerHandle) => void;
}

const defaultRuntime: NetworkingRuntime = {
	ownPeerId: selfId as PeerId,
	joinRoom,
	storage: {
		get: () => LS.get('player'),
		set: player => LS.set({ player }),
	},
	now: () => Date.now(),
	random: () => Math.random(),
	urlSearch: location.search,
	setTimeout: (handler, ms) => setTimeout(handler, ms),
	clearTimeout: timeout => clearTimeout(timeout),
};

export function createNetworkingRuntime(
	overrides: Partial<NetworkingRuntime> = {},
): NetworkingRuntime {
	return {
		...defaultRuntime,
		...overrides,
	};
}

export default class Networking<
	GameState extends { v: number },
	const GameAction extends { type: string },
> {
	state: {
		location: 'lobby' | 'game';
		self: NetworkPlayer;
		players: Record<PeerId, NetworkPlayer>;
		game: GameState;
		gameReady: boolean;
	};
	private readonly runtime: NetworkingRuntime;
	private playerRoom!: ReturnType<typeof joinRoom>;
	private sendPlayerUpdate!: ActionSender<NetworkPlayer>;
	private gameRoom: null | ReturnType<typeof joinRoom> = null;
	private sendAction!: ActionSender<GameAction>;
	private sendGameStateUpdate!: ActionSender<GameState>;
	private hostElectionTimeout!: NodeJS.Timeout;

	constructor(
		readonly config: {
			appId: string;
			getNewGameState: () => GameState;
			gameReducer: (state: GameState, action: GameAction) => void;
		},
		runtimeOverrides: Partial<NetworkingRuntime> = {},
	) {
		this.state = proxy({
			location: 'lobby',
			self: {} as any,
			players: {},
			game: config.getNewGameState(),
			gameReady: false,
		});
		this.runtime = createNetworkingRuntime(runtimeOverrides);
		this.setupPlayerRoom();
		if (this.state.self.room) {
			this.joinGameRoom({
				roomId: this.state.self.room,
				create: false,
			});
		}
	}

	/**
	 * many-to-many diff updates
	 */
	private setupPlayerRoom() {
		this.playerRoom = this.runtime.joinRoom({ appId: this.config.appId }, 'players');
		const [sendPlayerUpdate, onPlayerUpdate] =
			this.playerRoom.makeAction<NetworkPlayer>('playerUpdate');
		this.sendPlayerUpdate = sendPlayerUpdate;
		const self = this.runtime.storage.get()
			? { ...this.runtime.storage.get(), peerId: this.runtime.ownPeerId }
			: {
					id: `player:${this.runtime.now() % 1e6}${this.runtime.random().toString().slice(-3)}` as PlayerId,
					peerId: this.runtime.ownPeerId,
					name: 'unnamed',
					room: null,
					isHost: false,
				};
		const searchParams = new URLSearchParams(this.runtime.urlSearch);
		if (searchParams.get('room')) self.room = searchParams.get('room') as any;
		this.updateSelf(self);
		onPlayerUpdate((data, peerId) => {
			this.state.players[peerId] = data;
		});
		this.playerRoom.onPeerJoin(peerId =>
			this.sendPlayerUpdate(snapshot(this.state.self), [peerId]),
		);
		this.playerRoom.onPeerLeave(peerId => {
			delete this.state.players[peerId];
		});
	}

	getGameRoomHost() {
		if (!this.gameRoom) return null;
		const candidates = [...this.gameRoom.getPeerIds(), this.runtime.ownPeerId];
		return Object.values(this.state.players).find(p => p.isHost && candidates.includes(p.peerId));
	}

	updateSelf(diff: Partial<NetworkPlayer>) {
		Object.assign(this.state.self, diff);
		this.runtime.storage.set(this.state.self);
		this.state.players[this.runtime.ownPeerId] = snapshot(this.state.self);
		void this.sendPlayerUpdate(this.state.self);
	}

	leave() {
		this.runtime.clearTimeout(this.hostElectionTimeout);
		this.state.gameReady = false;
		this.updateSelf({ room: null });
		this.playerRoom.leave();
		this.gameRoom?.leave();
	}

	get rooms() {
		const rooms = Object.groupBy(
			Object.values(snapshot(this.state.players)),
			x => x.room || 'no-room',
		);
		delete rooms['no-room'];
		return Object.entries(rooms).map(([roomId, players]) => ({
			id: roomId as RoomId,
			players: players as NetworkPlayer[],
		}));
	}

	/**
	 * one-to-many with automatic host election
	 */
	joinGameRoom({ roomId, create }: { roomId: RoomId; create: boolean }) {
		this.leaveGameRoom();
		this.updateSelf({ room: roomId });
		this.state.location = 'game';
		this.state.gameReady = false;
		this.state.game = {
			...this.config.getNewGameState(),
			v: 0,
		};
		this.updateSelf({ isHost: create });
		this.gameRoom = this.runtime.joinRoom({ appId: this.config.appId }, roomId);
		const [sendGameStateUpdate, onGameStateUpdate] =
			this.gameRoom.makeAction<GameState>('gameState');
		this.sendGameStateUpdate = sendGameStateUpdate;
		const [sendAction, onAction] = this.gameRoom.makeAction<GameAction>('gameAction');
		this.sendAction = sendAction;
		onGameStateUpdate(data => {
			if (this.state.self.isHost) return;
			if (this.state.game.v > data.v) return;
			Object.assign(this.state.game, data);
			this.state.gameReady = true;
		});
		onAction(action => {
			if (!this.state.self.isHost) return;
			this.act(action);
		});
		this.gameRoom.onPeerJoin(peerId => {
			if (this.state.self.isHost) this.sendHostUpdate([peerId]);
		});
		this.gameRoom.onPeerLeave(peerId => {
			if (peerId !== this.getGameRoomHost()?.peerId) return;
			if (this.state.players[peerId]) this.state.players[peerId].isHost = false;
			void this.runHostElection();
		});
		this.hostElectionTimeout = this.runtime.setTimeout(
			() => {
				if (!this.getGameRoomHost()) void this.runHostElection();
			},
			(create ? 500 : 2000) + Math.round(this.runtime.random() * 100),
		);
	}

	leaveGameRoom() {
		this.state.location = 'lobby';
		this.updateSelf({ room: null, isHost: false });
		this.gameRoom?.leave();
		this.gameRoom = null;
		this.state.gameReady = false;
		this.state.game = this.config.getNewGameState();
	}

	getRandomRoomId() {
		const generate = () =>
			('room:' +
				[0, 0, 0, 0]
					.map(() => String.fromCharCode(65 + Math.ceil(this.runtime.random() * 25)))
					.join('')) as RoomId;
		const lobbies = this.rooms;
		for (let i = 0; i < 10; ++i) {
			const code = generate();
			if (!lobbies.find(x => x.id === code)) return code;
		}
		return generate();
	}

	act(action: GameAction) {
		if (!this.gameRoom) throw new Error('not in a game room');
		if (!this.state.gameReady) throw new Error('gameRoom.ready === false');
		if (this.state.self.isHost) {
			this.config.gameReducer(this.state.game, action);
			this.sendHostUpdate();
		} else {
			this.config.gameReducer(this.state.game, action); // optimistic update, will be overwritten when host broadcasts state
			this.state.game.v = Math.round((this.state.game.v + 1e-4) * 1e4) / 1e4;
			void this.sendAction(action);
		}
	}

	private sendHostUpdate(peers?: PeerId[]) {
		if (!this.gameRoom) throw new Error('not in a game room');
		if (!this.state.self.isHost) throw new Error('only host can do this, this should not happen');
		++this.state.game.v;
		void this.sendGameStateUpdate(this.state.game, peers);
	}

	private async runHostElection() {
		if (!this.gameRoom) throw new Error('not in a game room');
		const candidates = this.gameRoom.getPeerIds();
		console.log(candidates);
		candidates.push(this.runtime.ownPeerId);
		candidates.sort((a, b) => a.localeCompare(b));
		const existingHost = this.getGameRoomHost()?.peerId;
		if (existingHost && !candidates.includes(existingHost)) candidates.unshift(existingHost);
		if (!candidates.length)
			throw new Error('no candidates for host election, this should not happen');
		// keep going in order until you find someone alive or you're the host chief
		for (const peerId of candidates) {
			if (this.runtime.ownPeerId === peerId) {
				this.updateSelf({ isHost: true });
				this.state.gameReady = true;
				this.sendHostUpdate();
				break;
			}
			try {
				await promiseTimeout(1000, this.gameRoom.ping(peerId), this.runtime);
				break;
			} catch {}
		}
	}
}

/** alias on top of `trystero.joinRoom()` with better types and disposal tracking */
export function joinRoom(...args: Parameters<typeof baseJoinRoom>) {
	const base = baseJoinRoom(...args);
	const roomId = args[1] as RoomId;
	// trystero still accepts events after calling room.leave() which causes all sorts of issues
	// so override and noop the methods once leave is called
	let disposed = false;
	return {
		...base,
		get disposed() {
			return disposed;
		},
		roomId,
		leave() {
			disposed = true;
			return base.leave();
		},
		getPeers: base.getPeers as unknown as Record<PeerId, RTCPeerConnection>,
		getPeerIds: () => Object.values(base.getPeers) as PeerId[],
		onPeerJoin: (fn: (peerId: PeerId) => void) => {
			base.onPeerJoin((...args: any[]) => {
				if (disposed) return;
				fn(...(args as [any]));
			});
		},
		onPeerLeave: (fn: (peerId: PeerId) => void) => {
			base.onPeerLeave((...args: any[]) => {
				if (disposed) return;
				fn(...(args as [any]));
			});
		},
		makeAction: <T extends Record<string, any>>(
			namespace: string,
		): [ActionSender<T>, ActionReceiver<T>, ActionProgress] => {
			const [send, receive, progress] = base.makeAction(namespace);

			return [
				(...args: any[]) => {
					if (disposed) {
						console.warn(
							`calling ${roomId}.${namespace}.send() after .leave() is a noop. args =`,
							...args,
						);
						return Promise.resolve();
					}
					return send(...(args as [any]));
				},
				(fn: any) => {
					return receive((...args: any[]) => {
						if (disposed) return;
						// console.info(`${roomId}.${namespace}.receive()`, ...args);
						return fn(...args);
					});
				},
				progress,
			] as any;
		},
		ping: base.ping as (peerId: PeerId) => Promise<number>,
	};
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
