import { describe, expect, test } from 'bun:test';

import Networking, {
	createNetworkingRuntime,
	type NetworkingRuntime,
	type NetworkPlayer,
	type PeerId,
	type PlayerId,
	type RoomId,
} from './networking';

type TestGameState = {
	v: number;
	total: number;
	history: string[];
};

type TestGameAction = {
	type: 'add';
	amount: number;
	label: string;
};

type PendingMessage = {
	roomId: string;
	namespace: string;
	from: PeerId;
	to: PeerId;
	data: Record<string, unknown>;
};

function createGameState(): TestGameState {
	return {
		v: 0,
		total: 0,
		history: [],
	};
}

function gameReducer(state: TestGameState, action: TestGameAction) {
	state.total += action.amount;
	state.history.push(action.label);
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryStorage {
	private player: NetworkPlayer | null = null;

	get() {
		return this.player;
	}

	set(player: NetworkPlayer) {
		this.player = clone(player);
	}

	seed(player: NetworkPlayer) {
		this.player = clone(player);
	}
}

class TestScheduler {
	private nowMs = 0;
	private nextId = 1;
	private readonly timers: Array<{
		id: number;
		at: number;
		active: boolean;
		handler: () => void;
	}> = [];

	get now() {
		return this.nowMs;
	}

	setTimeout = (handler: () => void, ms: number) => {
		const timer = {
			id: this.nextId++,
			at: this.nowMs + ms,
			active: true,
			handler,
		};
		this.timers.push(timer);
		return timer as unknown as ReturnType<typeof setTimeout>;
	};

	clearTimeout = (timeout: ReturnType<typeof setTimeout>) => {
		const timer = timeout as unknown as (typeof this.timers)[number];
		timer.active = false;
	};

	advance(ms: number) {
		const target = this.nowMs + ms;
		while (true) {
			const next = this.timers
				.filter(timer => timer.active && timer.at <= target)
				.sort((a, b) => a.at - b.at || a.id - b.id)[0];
			if (!next) break;
			next.active = false;
			this.nowMs = next.at;
			next.handler();
		}
		this.nowMs = target;
	}
}

class FakeRoom {
	private readonly joinListeners: Array<(peerId: PeerId) => void> = [];
	private readonly leaveListeners: Array<(peerId: PeerId) => void> = [];
	private readonly actionListeners = new Map<string, Array<(data: Record<string, unknown>, peerId: PeerId) => void>>();

	constructor(
		private readonly network: FakeTrystero,
		readonly peerId: PeerId,
		readonly roomId: string,
	) {}

	onPeerJoin(fn: (peerId: PeerId) => void) {
		this.joinListeners.push(fn);
	}

	onPeerLeave(fn: (peerId: PeerId) => void) {
		this.leaveListeners.push(fn);
	}

	makeAction<T extends Record<string, unknown>>(namespace: string) {
		return [
			async (data: T, peers?: PeerId[]) => {
				this.network.queue({
					roomId: this.roomId,
					namespace,
					from: this.peerId,
					peers,
					data: clone(data),
				});
			},
			(fn: (data: T, peerId: PeerId) => void) => {
				const listeners = this.actionListeners.get(namespace) ?? [];
				listeners.push(fn as (data: Record<string, unknown>, peerId: PeerId) => void);
				this.actionListeners.set(namespace, listeners);
			},
			(() => {}) as any,
		] as const;
	}

	ping(peerId: PeerId) {
		return this.network.ping(this.roomId, this.peerId, peerId);
	}

	getPeers() {
		return {};
	}

	getPeerIds() {
		const peers = this.network.getRoomPeers(this.roomId);
		return peers.filter(id => id !== this.peerId);
	}

	leave() {
		this.network.leave(this.roomId, this.peerId);
		return Promise.resolve();
	}

	deliver(namespace: string, data: Record<string, unknown>, from: PeerId) {
		for (const listener of this.actionListeners.get(namespace) ?? []) {
			listener(clone(data), from);
		}
	}

	notifyJoin(peerId: PeerId) {
		for (const listener of this.joinListeners) {
			listener(peerId);
		}
	}

	notifyLeave(peerId: PeerId) {
		for (const listener of this.leaveListeners) {
			listener(peerId);
		}
	}
}

class FakeTrystero {
	private readonly rooms = new Map<string, Map<PeerId, FakeRoom>>();
	private readonly pingBehaviors = new Map<string, () => Promise<number>>();
	private readonly pending: PendingMessage[] = [];

	joinRoom(peerId: PeerId, roomId: string) {
		const room = new FakeRoom(this, peerId, roomId);
		const peers = this.rooms.get(roomId) ?? new Map<PeerId, FakeRoom>();
		const existingPeers = [...peers.values()];
		peers.set(peerId, room);
		this.rooms.set(roomId, peers);
		for (const existing of existingPeers) {
			existing.notifyJoin(peerId);
		}
		return room;
	}

	getRoomPeers(roomId: string): PeerId[] {
		const peers = this.rooms.get(roomId);
		if (!peers) return [];
		return [...peers.keys()];
	}

	queue({
		roomId,
		namespace,
		from,
		peers,
		data,
	}: {
		roomId: string;
		namespace: string;
		from: PeerId;
		peers?: PeerId[];
		data: Record<string, unknown>;
	}) {
		for (const [peerId] of this.rooms.get(roomId) ?? []) {
			if (peerId === from) continue;
			if (peers && !peers.includes(peerId)) continue;
			this.pending.push({
				roomId,
				namespace,
				from,
				to: peerId,
				data: clone(data),
			});
		}
	}

	inject(message: PendingMessage) {
		this.pending.push({
			...message,
			data: clone(message.data),
		});
	}

	flushAll() {
		while (this.pending.length) {
			const message = this.pending.shift()!;
			const room = this.rooms.get(message.roomId)?.get(message.to);
			if (!room) continue;
			room.deliver(message.namespace, message.data, message.from);
		}
	}

	leave(roomId: string, peerId: PeerId) {
		const peers = this.rooms.get(roomId);
		const room = peers?.get(peerId);
		if (!peers || !room) return;
		peers.delete(peerId);
		for (const other of peers.values()) {
			other.notifyLeave(peerId);
		}
		if (!peers.size) {
			this.rooms.delete(roomId);
		}
	}

	setPingBehavior(roomId: string, from: PeerId, to: PeerId, behavior: () => Promise<number>) {
		this.pingBehaviors.set(`${roomId}:${from}:${to}`, behavior);
	}

	ping(roomId: string, from: PeerId, to: PeerId) {
		const key = `${roomId}:${from}:${to}`;
		const custom = this.pingBehaviors.get(key);
		if (custom) return custom();
		if (this.rooms.get(roomId)?.has(to)) return Promise.resolve(1);
		return new Promise<number>(() => {});
	}
}

type PeerHarness = {
	peerId: PeerId;
	playerId: PlayerId;
	networking: Networking<TestGameState, TestGameAction>;
};

type TestContext = {
	scheduler: TestScheduler;
	transport: FakeTrystero;
};

const APP_ID = 'hanabi-test';
const ALPHA = 'room:ALPHA' as RoomId;

function createContext(): TestContext {
	return {
		scheduler: new TestScheduler(),
		transport: new FakeTrystero(),
	};
}

function createPeer(
	context: TestContext,
	{
		peerId,
		playerId,
		name,
		roomId = null,
	}: {
		peerId: PeerId;
		playerId: PlayerId;
		name: string;
		roomId?: RoomId | null;
	},
) {
	const storage = new MemoryStorage();
	storage.seed({
		id: playerId,
		peerId,
		name,
		room: roomId,
		isHost: false,
	});
	const runtime: Partial<NetworkingRuntime> = createNetworkingRuntime({
		ownPeerId: peerId,
		joinRoom: ((app: any, room: string) => context.transport.joinRoom(peerId, room) as any) as NetworkingRuntime['joinRoom'],
		storage,
		urlSearch: '',
		now: () => context.scheduler.now,
		random: () => 0,
		setTimeout: context.scheduler.setTimeout,
		clearTimeout: context.scheduler.clearTimeout,
	});
	return {
		peerId,
		playerId,
		networking: new Networking<TestGameState, TestGameAction>(
			{
				appId: APP_ID,
				getNewGameState: createGameState,
				gameReducer,
			},
			runtime,
		),
	} satisfies PeerHarness;
}

async function flushNetwork(context: TestContext, passes = 6) {
	for (let index = 0; index < passes; index += 1) {
		context.transport.flushAll();
		await Promise.resolve();
	}
}

async function advance(context: TestContext, ms: number) {
	let remaining = ms;
	while (remaining > 0) {
		const step = Math.min(remaining, 1000);
		context.scheduler.advance(step);
		await flushNetwork(context);
		remaining -= step;
	}
}

function findPlayerById(networking: Networking<TestGameState, TestGameAction>, playerId: PlayerId) {
	return Object.values(networking.state.players).find(p => p.id === playerId);
}

describe('networking', () => {
	test('rehydrates persisted room membership and publishes it through presence rooms', async () => {
		const context = createContext();
		const alex = createPeer(context, {
			peerId: 'peer-alex' as PeerId,
			playerId: 'player:1' as PlayerId,
			name: 'Alex',
			roomId: ALPHA,
		});
		const blair = createPeer(context, {
			peerId: 'peer-blair' as PeerId,
			playerId: 'player:2' as PlayerId,
			name: 'Blair',
		});

		await flushNetwork(context);

		expect(alex.networking.state.self.room).toBe(ALPHA);
		expect(findPlayerById(blair.networking, alex.playerId)?.room).toBe(ALPHA);
		expect(blair.networking.rooms).toEqual([
			{
				id: ALPHA,
				players: [expect.objectContaining({ id: alex.playerId, name: 'Alex' })],
			},
		]);
	});

	test('elects the lowest stable player id and syncs followers after concurrent startup', async () => {
		const context = createContext();
		const hostCandidate = createPeer(context, {
			peerId: 'peer-a' as PeerId,
			playerId: 'player:1' as PlayerId,
			name: 'Alex',
			roomId: ALPHA,
		});
		const second = createPeer(context, {
			peerId: 'peer-b' as PeerId,
			playerId: 'player:2' as PlayerId,
			name: 'Blair',
			roomId: ALPHA,
		});
		const third = createPeer(context, {
			peerId: 'peer-c' as PeerId,
			playerId: 'player:3' as PlayerId,
			name: 'Casey',
			roomId: ALPHA,
		});

		await flushNetwork(context);
		await advance(context, 2100);

		expect(hostCandidate.networking.getGameRoomHost()?.peerId).toBe(hostCandidate.peerId);
		expect(hostCandidate.networking.state.game.v).toBe(1);
		expect(second.networking.state.gameReady).toBeTrue();
		expect(second.networking.state.game.v).toBe(1);
		expect(third.networking.state.gameReady).toBeTrue();
		expect(third.networking.state.game.v).toBe(1);
	});

	test('reconciles optimistic follower actions and ignores stale snapshots that arrive later', async () => {
		const context = createContext();
		const alex = createPeer(context, {
			peerId: 'peer-a' as PeerId,
			playerId: 'player:1' as PlayerId,
			name: 'Alex',
		});
		const blair = createPeer(context, {
			peerId: 'peer-b' as PeerId,
			playerId: 'player:2' as PlayerId,
			name: 'Blair',
		});

		await flushNetwork(context);
		alex.networking.joinGameRoom({ roomId: ALPHA, create: false });
		blair.networking.joinGameRoom({ roomId: ALPHA, create: false });
		await flushNetwork(context);
		await advance(context, 2100);

		const hostPeerId = alex.networking.getGameRoomHost()!.peerId;
		expect(hostPeerId).toBe(alex.peerId);
		const initialVersion = alex.networking.state.game.v;

		const staleSnapshot = {
			v: initialVersion,
			total: 0,
			history: [] as string[],
		};

		blair.networking.act({
			type: 'add',
			amount: 3,
			label: 'optimistic',
		});

		expect(blair.networking.state.game.total).toBe(3);
		expect(blair.networking.state.game.history).toEqual(['optimistic']);

		await flushNetwork(context);

		expect(alex.networking.state.self.isHost).toBeTrue();
		expect(alex.networking.state.game.v).toBe(initialVersion + 1);
		expect(alex.networking.state.game.total).toBe(3);
		expect(alex.networking.state.game.history).toEqual(['optimistic']);
		expect(blair.networking.state.gameReady).toBeTrue();
		expect(blair.networking.state.game.v).toBe(initialVersion + 1);
		expect(blair.networking.state.game.total).toBe(3);
		expect(blair.networking.state.game.history).toEqual(['optimistic']);

		context.transport.inject({
			roomId: ALPHA,
			namespace: 'gameState',
			from: alex.peerId,
			to: blair.peerId,
			data: staleSnapshot,
		});
		await flushNetwork(context);

		expect(blair.networking.state.gameReady).toBeTrue();
		expect(blair.networking.state.game.v).toBe(initialVersion + 1);
		expect(blair.networking.state.game.total).toBe(3);
		expect(blair.networking.state.game.history).toEqual(['optimistic']);
	});

	test('leaveGameRoom resets state and removes self from the room', async () => {
		const context = createContext();
		const alex = createPeer(context, {
			peerId: 'peer-a' as PeerId,
			playerId: 'player:1' as PlayerId,
			name: 'Alex',
		});
		const blair = createPeer(context, {
			peerId: 'peer-b' as PeerId,
			playerId: 'player:2' as PlayerId,
			name: 'Blair',
		});

		await flushNetwork(context);
		alex.networking.joinGameRoom({ roomId: ALPHA, create: false });
		blair.networking.joinGameRoom({ roomId: ALPHA, create: false });
		await flushNetwork(context);
		await advance(context, 2100);

		expect(alex.networking.state.self.room).toBe(ALPHA);
		expect(alex.networking.state.gameReady).toBeTrue();

		alex.networking.leaveGameRoom();
		await flushNetwork(context);

		expect(alex.networking.state.self.room).toBeNull();
		expect(alex.networking.state.gameReady).toBeFalse();
		expect(alex.networking.state.location).toBe('lobby');
		expect(findPlayerById(blair.networking, alex.playerId)?.room).toBeNull();
	});
});
