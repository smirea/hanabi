import { describe, expect, test } from 'bun:test';

import Networking, {
	createNetworkingRuntime,
	type NetworkingRuntime,
	type PeerId,
	type PlayerId,
	type RoomId,
} from './networking';

type TestGameState = {
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
		total: 0,
		history: [],
	};
}

function applyAction(state: TestGameState, action: TestGameAction) {
	state.total += action.amount;
	state.history.push(action.label);
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
	private readonly values = new Map<string, string>();

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
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
	storage.setItem(
		'networking:player',
		JSON.stringify({
			id: playerId,
			peerId,
			name,
			room: roomId,
		}),
	);
	const runtime: Partial<NetworkingRuntime> = createNetworkingRuntime({
		selfId: peerId,
		joinRoom: ((app, room) => context.transport.joinRoom(peerId, room) as any) as NetworkingRuntime['joinRoom'],
		storage,
		locationSearch: '',
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
				applyAction,
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

describe('networking', () => {
	test('rehydrates persisted room membership and publishes it through presence lobbies', async () => {
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

		expect(alex.networking.gameRoom?.roomId).toBe(ALPHA);
		expect(blair.networking.playerRoom.getById(alex.playerId)?.room).toBe(ALPHA);
		expect(blair.networking.lobbies).toEqual([
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
		await advance(context, 500);

		expect(hostCandidate.networking.state.gameRoom.host).toBe(hostCandidate.peerId);
		expect(hostCandidate.networking.state.gameRoom.v).toBe(1);
		expect(second.networking.state.gameRoom).toMatchObject({
			host: hostCandidate.peerId,
			ready: true,
			v: 1,
		});
		expect(third.networking.state.gameRoom).toMatchObject({
			host: hostCandidate.peerId,
			ready: true,
			v: 1,
		});
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
		alex.networking.joinRoom({ roomId: ALPHA, isHost: true });
		blair.networking.joinRoom({ roomId: ALPHA, isHost: false });
		await flushNetwork(context);

		const staleSnapshot = {
			v: 1,
			host: alex.peerId,
			game: createGameState(),
		};

		blair.networking.gameRoom?.act({
			type: 'add',
			amount: 3,
			label: 'optimistic',
		});

		expect(blair.networking.state.gameRoom.game).toEqual({
			total: 3,
			history: ['optimistic'],
		});
		expect(blair.networking.state.gameRoom.v).toBe(1.0001);

		await flushNetwork(context);

		expect(alex.networking.state.gameRoom.host).toBe(alex.peerId);
		expect(alex.networking.state.gameRoom.v).toBe(2);
		expect(alex.networking.state.gameRoom.game).toEqual({
			total: 3,
			history: ['optimistic'],
		});
		expect(blair.networking.state.gameRoom.host).toBe(alex.peerId);
		expect(blair.networking.state.gameRoom.ready).toBeTrue();
		expect(blair.networking.state.gameRoom.v).toBe(2);
		expect(blair.networking.state.gameRoom.game).toEqual({
			total: 3,
			history: ['optimistic'],
		});

		context.transport.inject({
			roomId: ALPHA,
			namespace: 'gameState',
			from: alex.peerId,
			to: blair.peerId,
			data: staleSnapshot,
		});
		await flushNetwork(context);

		expect(blair.networking.state.gameRoom.host).toBe(alex.peerId);
		expect(blair.networking.state.gameRoom.ready).toBeTrue();
		expect(blair.networking.state.gameRoom.v).toBe(2);
		expect(blair.networking.state.gameRoom.game).toEqual({
			total: 3,
			history: ['optimistic'],
		});
	});

	test('skips stale presence candidates during host election when the old host disappears first', async () => {
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
		const casey = createPeer(context, {
			peerId: 'peer-c' as PeerId,
			playerId: 'player:3' as PlayerId,
			name: 'Casey',
		});

		await flushNetwork(context);
		alex.networking.joinRoom({ roomId: ALPHA, isHost: true });
		blair.networking.joinRoom({ roomId: ALPHA, isHost: false });
		casey.networking.joinRoom({ roomId: ALPHA, isHost: false });
		await flushNetwork(context);

		blair.networking.gameRoom?.leave();
		blair.networking.gameRoom = null;
		alex.networking.leaveRoom();

		await advance(context, 2000);

		expect(casey.networking.state.gameRoom.host).toBe(casey.peerId);
		expect(casey.networking.state.gameRoom.game).toEqual(createGameState());
		expect(casey.networking.state.gameRoom.v).toBeGreaterThanOrEqual(2);
	});
});
