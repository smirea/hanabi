import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env } from 'node:process';
import { asc, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
	applyOnlineRoomAction,
	createInitialOnlineRoomState,
	playerIdForUser,
	sanitizePlayerName,
	selectRoomDirectoryListings,
	selectRoomViewState,
	type GameHistoryEntry,
	type OnlineRoomAction,
	type OnlineRoomState,
	type RoomResponse,
	type UserRecord,
} from '../../shared/onlineGame';
import type { HanabiState } from '../../shared/game';

const apiPort = Number(env.API_PORT ?? 3001);
if (Number.isNaN(apiPort)) throw new Error('API_PORT must be a valid number');

const rootDirectory = join(import.meta.dir, '..', '..');
const databasePath = env.DATABASE_URL ?? join(rootDirectory, '.data', 'hanabi.sqlite');
const serveClient = env.SERVE_CLIENT === '1' || env.SERVE_CLIENT === 'true';
const clientDistDirectory = join(rootDirectory, 'client', 'dist');
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	createdAt: text('created_at').notNull(),
	updatedAt: text('updated_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
	code: text('code').primaryKey(),
	createdAt: text('created_at').notNull(),
	updatedAt: text('updated_at').notNull(),
});

export const roomActions = sqliteTable('room_actions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	roomCode: text('room_code').notNull(),
	userId: integer('user_id').notNull(),
	type: text('type').notNull(),
	payload: text('payload').notNull(),
	createdAt: text('created_at').notNull(),
});

sqlite.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id integer PRIMARY KEY AUTOINCREMENT,
		name text NOT NULL,
		created_at text NOT NULL,
		updated_at text NOT NULL
	);
	CREATE TABLE IF NOT EXISTS rooms (
		code text PRIMARY KEY,
		created_at text NOT NULL,
		updated_at text NOT NULL
	);
	CREATE TABLE IF NOT EXISTS room_actions (
		id integer PRIMARY KEY AUTOINCREMENT,
		room_code text NOT NULL,
		user_id integer NOT NULL,
		type text NOT NULL,
		payload text NOT NULL,
		created_at text NOT NULL,
		FOREIGN KEY (room_code) REFERENCES rooms(code),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);
	CREATE INDEX IF NOT EXISTS room_actions_room_code_id_idx ON room_actions(room_code, id);
`);

const db = drizzle(sqlite);
const encoder = new TextEncoder();
type RoomActionRow = typeof roomActions.$inferSelect;
type RoomClient = {
	controller: ReadableStreamDefaultController<Uint8Array>;
	userId: number | null;
};
const roomClients = new Map<string, Set<RoomClient>>();
const roomStateCache = new Map<string, OnlineRoomState>();

class HttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

function nowIso() {
	return new Date().toISOString();
}

function json(data: unknown, init?: ResponseInit) {
	return Response.json(data, init);
}

function apiPathname(pathname: string): string {
	if (pathname === '/api') return '/';
	if (pathname.startsWith('/api/')) return pathname.slice(4);
	return pathname;
}

function isApiPathname(pathname: string): boolean {
	return pathname === '/api' || pathname.startsWith('/api/');
}

async function clientAssetResponse(url: URL): Promise<Response | null> {
	if (!serveClient) return null;

	let pathname: string;
	try {
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return null;
	}

	const parts = pathname.split('/').filter(Boolean);
	if (parts.some(part => part === '..' || part.includes('\0'))) return null;

	const assetPath = join(clientDistDirectory, ...(parts.length ? parts : ['index.html']));
	const asset = Bun.file(assetPath);
	if (await asset.exists()) return new Response(asset);

	const index = Bun.file(join(clientDistDirectory, 'index.html'));
	if (!(await index.exists())) return null;
	return new Response(index, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function parseRoomCode(value: string | undefined): string | null {
	const code = value?.trim().toUpperCase() ?? '';
	return /^[A-Z]{4}$/.test(code) ? code : null;
}

function terminalStatus(status: HanabiState['status']) {
	return status === 'won' || status === 'lost' || status === 'finished';
}

function scoreGame(game: HanabiState): number {
	return Object.values(game.fireworks).reduce((score, pile) => score + pile.length, 0);
}

function readAction(row: RoomActionRow): OnlineRoomAction | null {
	try {
		return JSON.parse(row.payload) as OnlineRoomAction;
	} catch {
		return null;
	}
}

function getUser(userId: number | null): UserRecord | null {
	if (!userId || !Number.isInteger(userId) || userId < 1) return null;

	const user = db.select().from(users).where(eq(users.id, userId)).get();
	return user ? { id: user.id, name: user.name } : null;
}

function ensureUser(userId: number | null, rawName: string | null | undefined): UserRecord {
	const name = sanitizePlayerName(rawName ?? '') ?? 'Player';
	const existing = getUser(userId);
	const timestamp = nowIso();

	if (existing) {
		if (existing.name !== name) {
			db.update(users).set({ name, updatedAt: timestamp }).where(eq(users.id, existing.id)).run();
		}

		return { ...existing, name };
	}

	const inserted = db
		.insert(users)
		.values({ name, createdAt: timestamp, updatedAt: timestamp })
		.returning()
		.get();
	return { id: inserted.id, name: inserted.name };
}

function ensureRoom(code: string): void {
	const existing = db.select().from(rooms).where(eq(rooms.code, code)).get();
	if (existing) return;

	const timestamp = nowIso();
	db.insert(rooms).values({ code, createdAt: timestamp, updatedAt: timestamp }).run();
}

function getRoomActions(code: string): RoomActionRow[] {
	return db
		.select()
		.from(roomActions)
		.where(eq(roomActions.roomCode, code))
		.orderBy(asc(roomActions.id))
		.all();
}

function loadRoomState(code: string): OnlineRoomState {
	const cached = roomStateCache.get(code);
	if (cached) return cached;

	const state = createInitialOnlineRoomState();
	for (const row of getRoomActions(code)) {
		const action = readAction(row);
		if (!action) continue;

		applyOnlineRoomAction(state, action);
		state.v = row.id;
	}

	roomStateCache.set(code, state);
	return state;
}

function roomResponse(
	code: string,
	userId: number | null,
	state = loadRoomState(code),
): RoomResponse {
	return {
		room: selectRoomViewState(state, userId, 'connected'),
	};
}

function eventChunk(code: string, userId: number | null, state?: OnlineRoomState) {
	return encoder.encode(
		`event: room\ndata: ${JSON.stringify(roomResponse(code, userId, state))}\n\n`,
	);
}

function broadcastRoom(code: string, state = loadRoomState(code)) {
	const clients = roomClients.get(code);
	if (!clients?.size) return;

	for (const client of clients) {
		try {
			client.controller.enqueue(eventChunk(code, client.userId, state));
		} catch {
			clients.delete(client);
		}
	}
}

function streamRoom(code: string, userId: number | null) {
	let client: RoomClient | null = null;

	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				client = { controller, userId };
				const clients = roomClients.get(code) ?? new Set<RoomClient>();
				clients.add(client);
				roomClients.set(code, clients);
				controller.enqueue(encoder.encode('retry: 1000\n\n'));
				controller.enqueue(eventChunk(code, userId));
			},
			cancel() {
				if (!client) return;

				const clients = roomClients.get(code);
				clients?.delete(client);
				if (clients && clients.size === 0) roomClients.delete(code);
			},
		}),
		{
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
		},
	);
}

function appendRoomAction(code: string, userId: number, action: OnlineRoomAction) {
	ensureRoom(code);
	const storedAction: OnlineRoomAction =
		action.type === 'set-ready' && action.ready && action.shuffleSeed === undefined
			? { ...action, shuffleSeed: Math.floor(Math.random() * 2 ** 31) }
			: action;
	if (storedAction.actorId !== playerIdForUser(userId)) throw new HttpError('Wrong actor', 403);
	if (storedAction.type === 'game-action' && storedAction.action.actorId !== storedAction.actorId) {
		throw new HttpError('Wrong game actor', 403);
	}

	const current = loadRoomState(code);
	const next = structuredClone(current);
	const changed = applyOnlineRoomAction(next, storedAction);
	if (!changed) return current;

	const timestamp = nowIso();
	const inserted = db
		.insert(roomActions)
		.values({
			roomCode: code,
			userId,
			type: storedAction.type,
			payload: JSON.stringify(storedAction),
			createdAt: timestamp,
		})
		.returning()
		.get();
	db.update(rooms).set({ updatedAt: timestamp }).where(eq(rooms.code, code)).run();
	next.v = inserted.id;
	roomStateCache.set(code, next);
	broadcastRoom(code, next);
	return next;
}

function leaveOtherRooms(targetCode: string, user: UserRecord): void {
	const playerId = playerIdForUser(user.id);
	const allRooms = db.select().from(rooms).all();

	for (const room of allRooms) {
		if (room.code === targetCode) continue;

		const state = loadRoomState(room.code);
		if (!state.members.some(member => member.userId === user.id)) continue;

		appendRoomAction(room.code, user.id, { type: 'leave', actorId: playerId });
	}
}

async function readBody<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new HttpError('Invalid JSON', 400);
	}
}

function completedGame(
	roomCode: string,
	state: OnlineRoomState,
	endedAt: string,
): GameHistoryEntry | null {
	const game = state.gameState;
	if (!game || !terminalStatus(game.status)) return null;

	return {
		roomCode,
		score: scoreGame(game),
		status: game.status,
		endedAt,
		players: game.players.map(player => player.name),
		settings: state.settings,
		turns: game.turn,
	};
}

function historyForRoom(code: string): GameHistoryEntry[] {
	const state = createInitialOnlineRoomState();
	const games: GameHistoryEntry[] = [];

	for (const row of getRoomActions(code)) {
		const beforeStatus = state.gameState?.status;
		const action = readAction(row);
		if (!action) continue;

		applyOnlineRoomAction(state, action);
		state.v = row.id;
		const nextStatus = state.gameState?.status;
		if (
			(!beforeStatus || !terminalStatus(beforeStatus)) &&
			nextStatus &&
			terminalStatus(nextStatus)
		) {
			const completed = completedGame(code, state, row.createdAt);
			if (completed) games.push(completed);
		}
	}

	return games;
}

function activeRoomDirectory() {
	const allRooms = db.select().from(rooms).orderBy(desc(rooms.updatedAt)).all();
	const entries = allRooms
		.map(room => ({ code: room.code, state: loadRoomState(room.code) }))
		.filter(room => room.state.members.length > 0)
		.filter(room => !room.state.gameState || !terminalStatus(room.state.gameState.status));
	return selectRoomDirectoryListings(entries);
}

function allHistory() {
	return db
		.select()
		.from(rooms)
		.orderBy(desc(rooms.updatedAt))
		.all()
		.flatMap(room => historyForRoom(room.code))
		.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

const server = Bun.serve({
	development: env.NODE_ENV !== 'production',
	port: apiPort,
	async fetch(request) {
		try {
			const url = new URL(request.url);
			const originalPathname = url.pathname;
			const handleApi = isApiPathname(originalPathname) || !serveClient;

			if (handleApi) {
				url.pathname = apiPathname(url.pathname);
				const parts = url.pathname.split('/').filter(Boolean);

				if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
				if (url.pathname === '/status') return json({ ok: true });

				if (url.pathname === '/users' && request.method === 'POST') {
					const body = await readBody<{ userId?: number | null; name?: string }>(request);
					return json({ user: ensureUser(body.userId ?? null, body.name) });
				}

				if (url.pathname === '/rooms' && request.method === 'GET') {
					return json({ rooms: activeRoomDirectory() });
				}

				if (url.pathname === '/history' && request.method === 'GET') {
					return json({ games: allHistory() });
				}

				if (parts[0] === 'rooms') {
					const code = parseRoomCode(parts[1]);
					if (!code) return json({ error: 'Invalid room code' }, { status: 400 });

					if (request.method === 'GET' && parts.length === 2) {
						ensureRoom(code);
						const userId = Number(url.searchParams.get('userId'));
						return json(roomResponse(code, Number.isInteger(userId) ? userId : null));
					}

					if (request.method === 'GET' && parts[2] === 'events') {
						ensureRoom(code);
						const userId = Number(url.searchParams.get('userId'));
						return streamRoom(code, Number.isInteger(userId) ? userId : null);
					}

					if (request.method === 'POST' && parts[2] === 'join') {
						const body = await readBody<{ userId?: number | null; name?: string }>(request);
						const user = ensureUser(body.userId ?? null, body.name);
						leaveOtherRooms(code, user);
						const state = appendRoomAction(code, user.id, {
							type: 'join',
							actorId: playerIdForUser(user.id),
							userId: user.id,
							name: user.name,
						});
						return json(roomResponse(code, user.id, state));
					}

					if (request.method === 'POST' && parts[2] === 'actions') {
						const body = await readBody<{ userId?: number; action?: OnlineRoomAction }>(request);
						const user = getUser(body.userId ?? null);
						if (!user) return json({ error: 'Unknown user' }, { status: 401 });
						if (!body.action) return json({ error: 'Missing action' }, { status: 400 });

						const state = appendRoomAction(code, user.id, body.action);
						return json(roomResponse(code, user.id, state));
					}
				}

				return json({ error: 'Not found' }, { status: 404 });
			}

			if (request.method === 'GET' || request.method === 'HEAD') {
				const asset = await clientAssetResponse(url);
				if (asset) return asset;
			}

			return json({ error: 'Not found' }, { status: 404 });
		} catch (error) {
			if (error instanceof HttpError)
				return json({ error: error.message }, { status: error.status });
			if (error instanceof Response) return error;

			console.error(error);
			return json(
				{ error: error instanceof Error ? error.message : 'Internal server error' },
				{ status: 500 },
			);
		}
	},
});

console.log('Server running at:', server.url);
