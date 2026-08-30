import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env } from 'node:process';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
	applyOnlineRoomAction,
	createInitialOnlineRoomState,
	playerIdForUser,
	sanitizePlayerName,
	selectRoomDirectoryListings,
	selectRoomViewState,
	type CurrentRoomResponse,
	type GameHistoryEntry,
	type GameHistoryPlayerStats,
	type OnlineRoomAction,
	type OnlineRoomState,
	type RoomDirectoryListing,
	type RoomResponse,
	type UserRecord,
	type VersionResponse,
} from '../../shared/onlineGame';
import { scoreHanabiState, type HanabiState } from '../../shared/game';

const apiPort = Number(env.API_PORT ?? 3001);
if (Number.isNaN(apiPort)) throw new Error('API_PORT must be a valid number');

const rootDirectory = join(import.meta.dir, '..', '..');
const databasePath = env.DATABASE_URL ?? join(rootDirectory, '.data', 'hanabi.sqlite');
const serveClient = env.SERVE_CLIENT === '1' || env.SERVE_CLIENT === 'true';
const clientDistDirectory = join(rootDirectory, 'client', 'dist');
const githubRepository = env.GITHUB_REPOSITORY || 'smirea/hanabi';
const githubBranch = env.GITHUB_REF_NAME || env.GITHUB_BRANCH || 'master';
const githubCommitUrl =
	env.GITHUB_COMMIT_API_URL ??
	`https://api.github.com/repos/${githubRepository}/commits/${githubBranch}`;
const versionCacheMs = 60_000;
const serverIdleTimeoutSeconds = 60;
const sseHeartbeatMs = 5_000;
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	clientKey: text('client_key'),
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
		client_key text,
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

const userColumns = sqlite.query<{ name: string }, []>('PRAGMA table_info(users)').all();
if (!userColumns.some(column => column.name === 'client_key')) {
	sqlite.exec('ALTER TABLE users ADD COLUMN client_key text');
}
sqlite.exec(
	'CREATE UNIQUE INDEX IF NOT EXISTS users_client_key_idx ON users(client_key) WHERE client_key IS NOT NULL',
);

const db = drizzle(sqlite);
const encoder = new TextEncoder();
type RoomActionRow = typeof roomActions.$inferSelect;
type UserRow = typeof users.$inferSelect;
type AdminHistoryGame = GameHistoryEntry & {
	id: string;
	startActionId: number;
	endActionId: number;
};
type AdminHistoryUser = {
	id: string;
	userId: number | null;
	name: string;
	gamesPlayed: number;
};
type AdminSummaryResponse = {
	rooms: RoomDirectoryListing[];
	users: AdminHistoryUser[];
	games: AdminHistoryGame[];
};
type RoomClient = {
	controller: ReadableStreamDefaultController<Uint8Array>;
	userId: number | null;
};
const roomClients = new Map<string, Set<RoomClient>>();
const roomStateCache = new Map<string, OnlineRoomState>();
let versionCache: { loadedAt: number; payload: VersionResponse } | null = null;

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

async function loadVersion(): Promise<VersionResponse> {
	const now = Date.now();
	if (versionCache && now - versionCache.loadedAt < versionCacheMs) {
		return versionCache.payload;
	}

	try {
		const headers: HeadersInit = {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'hanabi-version',
		};
		if (env.GITHUB_TOKEN) {
			headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
		}

		const response = await fetch(githubCommitUrl, { headers });
		if (!response.ok) {
			throw new Error(`GitHub returned ${response.status}`);
		}

		const payload = (await response.json()) as {
			commit?: { committer?: { date?: string }; author?: { date?: string } };
		};
		const committedAt = payload.commit?.committer?.date ?? payload.commit?.author?.date ?? null;
		const version = { committedAt };
		versionCache = { loadedAt: now, payload: version };
		return version;
	} catch (error) {
		console.warn('Unable to load version from GitHub', error);
		return versionCache?.payload ?? { committedAt: null };
	}
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
	return scoreHanabiState(game);
}

function userNameKey(value: string) {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function historyGameId(roomCode: string, startActionId: number, endActionId: number): string {
	return `${roomCode}:${startActionId}:${endActionId}`;
}

function parseHistoryGameId(value: string | null | undefined) {
	const [roomCodeValue, startValue, endValue] = value?.split(':') ?? [];
	const roomCode = parseRoomCode(roomCodeValue);
	const startActionId = Number(startValue);
	const endActionId = Number(endValue);
	if (
		!roomCode ||
		!Number.isInteger(startActionId) ||
		!Number.isInteger(endActionId) ||
		startActionId < 1 ||
		endActionId < startActionId
	) {
		return null;
	}

	return { roomCode, startActionId, endActionId };
}

function userIdFromPlayerId(playerId: string): number | null {
	const match = /^player:(\d+)$/.exec(playerId);
	if (!match) return null;

	const userId = Number(match[1]);
	return Number.isInteger(userId) && userId > 0 ? userId : null;
}

const playerNameAliases = new Map([['lucia 2', 'Lucia']]);

function canonicalPlayerName(value: string): string {
	return playerNameAliases.get(userNameKey(value)) ?? value;
}

function playerHistoryStats(game: HanabiState): GameHistoryPlayerStats[] {
	const stats = new Map(
		game.players.map(player => [
			player.id,
			{
				id: player.id,
				name: canonicalPlayerName(player.name),
				hintsGiven: 0,
				hintsReceived: 0,
				plays: 0,
				discards: 0,
			},
		]),
	);

	for (const log of game.logs) {
		if (log.type === 'hint') {
			const actor = stats.get(log.actorId);
			if (actor) actor.hintsGiven += 1;
			const target = stats.get(log.targetId);
			if (target) target.hintsReceived += 1;
			continue;
		}

		if (log.type === 'play') {
			const actor = stats.get(log.actorId);
			if (actor) actor.plays += 1;
			continue;
		}

		if (log.type === 'discard') {
			const actor = stats.get(log.actorId);
			if (actor) actor.discards += 1;
		}
	}

	return [...stats.values()];
}

function readAction(row: RoomActionRow): OnlineRoomAction | null {
	try {
		return JSON.parse(row.payload) as OnlineRoomAction;
	} catch {
		return null;
	}
}

function userRecord(user: UserRow): UserRecord {
	return { id: user.id, name: user.name };
}

function getUserRow(userId: number | null): UserRow | null {
	if (!userId || !Number.isInteger(userId) || userId < 1) return null;
	return db.select().from(users).where(eq(users.id, userId)).get() ?? null;
}

function getUserByClientKey(clientKey: string | null): UserRow | null {
	if (!clientKey) return null;
	return db.select().from(users).where(eq(users.clientKey, clientKey)).get() ?? null;
}

function getUser(userId: number | null): UserRecord | null {
	const user = getUserRow(userId);
	return user ? userRecord(user) : null;
}

function getUserByIdOrClientKey(
	userId: number | null,
	clientKeyValue: string | null,
): UserRow | null {
	return getUserRow(userId) ?? getUserByClientKey(sanitizeClientKey(clientKeyValue));
}

function sanitizeClientKey(value: string | null | undefined): string | null {
	const key = value?.trim() ?? '';
	return key ? key.slice(0, 128) : null;
}

function updateUser(user: UserRow, name: string, clientKey: string | null): UserRecord {
	const timestamp = nowIso();
	const updates: Partial<typeof users.$inferInsert> = {};
	if (user.name !== name) updates.name = name;
	if (clientKey && !user.clientKey) updates.clientKey = clientKey;
	if (Object.keys(updates).length > 0) {
		db.update(users)
			.set({ ...updates, updatedAt: timestamp })
			.where(eq(users.id, user.id))
			.run();
	}

	return { id: user.id, name };
}

function ensureUser(
	userId: number | null,
	clientKeyValue: string | null | undefined,
	rawName: string | null | undefined,
): UserRecord {
	const name = sanitizePlayerName(rawName ?? '') ?? 'Player';
	const clientKey = sanitizeClientKey(clientKeyValue);
	const existing = getUserRow(userId) ?? getUserByClientKey(clientKey);
	const timestamp = nowIso();

	if (existing) {
		return updateUser(existing, name, clientKey);
	}

	try {
		const inserted = db
			.insert(users)
			.values({ clientKey, name, createdAt: timestamp, updatedAt: timestamp })
			.returning()
			.get();
		return userRecord(inserted);
	} catch (error) {
		const existingByClientKey = getUserByClientKey(clientKey);
		if (existingByClientKey) return updateUser(existingByClientKey, name, clientKey);
		throw error;
	}
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
	return sseChunk('room', roomResponse(code, userId, state));
}

function sseChunk(event: string, data: unknown) {
	return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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

function broadcastRoomDeleted(code: string) {
	const clients = roomClients.get(code);
	if (!clients?.size) return;

	for (const client of clients) {
		try {
			client.controller.enqueue(sseChunk('room-deleted', { roomCode: code }));
		} catch {}
		try {
			client.controller.close();
		} catch {}
	}
	roomClients.delete(code);
}

function broadcastUserDeleted(userId: number) {
	for (const [code, clients] of roomClients) {
		const deletedClients: RoomClient[] = [];
		for (const client of clients) {
			if (client.userId !== userId) continue;
			deletedClients.push(client);
		}

		for (const client of deletedClients) {
			try {
				client.controller.enqueue(sseChunk('user-deleted', { userId }));
			} catch {}
			try {
				client.controller.close();
			} catch {}
			clients.delete(client);
		}
		if (clients.size === 0) roomClients.delete(code);
	}
}

function streamRoom(code: string, userId: number | null) {
	let client: RoomClient | null = null;
	let heartbeat: Timer | null = null;

	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				client = { controller, userId };
				const clients = roomClients.get(code) ?? new Set<RoomClient>();
				clients.add(client);
				roomClients.set(code, clients);
				controller.enqueue(encoder.encode('retry: 1000\n\n'));
				controller.enqueue(eventChunk(code, userId));
				heartbeat = setInterval(() => {
					try {
						controller.enqueue(encoder.encode(': heartbeat\n\n'));
					} catch {
						if (heartbeat) clearInterval(heartbeat);
					}
				}, sseHeartbeatMs);
			},
			cancel() {
				if (heartbeat) clearInterval(heartbeat);
				if (!client) return;

				const clients = roomClients.get(code);
				clients?.delete(client);
				if (clients && clients.size === 0) roomClients.delete(code);
			},
		}),
		{
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				'X-Accel-Buffering': 'no',
				Connection: 'keep-alive',
			},
		},
	);
}

function appendRoomAction(code: string, userId: number, action: OnlineRoomAction) {
	ensureRoom(code);
	const storedAction: OnlineRoomAction =
		((action.type === 'set-ready' && action.ready) ||
			(action.type === 'set-rematch' && action.rematch)) &&
		action.shuffleSeed === undefined
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

function deleteRoomData(code: string) {
	const existing = db.select().from(rooms).where(eq(rooms.code, code)).get();
	if (!existing) return { ok: true, roomCode: code, deletedRoom: false, kickedUsers: [] };

	const kickedUsers = loadRoomState(code).members.map(member => member.userId);
	broadcastRoomDeleted(code);
	const deletedActions = db
		.delete(roomActions)
		.where(eq(roomActions.roomCode, code))
		.returning({ id: roomActions.id })
		.all();
	const deletedRooms = db
		.delete(rooms)
		.where(eq(rooms.code, code))
		.returning({ code: rooms.code })
		.all();
	roomStateCache.delete(code);

	return {
		ok: true,
		roomCode: code,
		deletedRoom: deletedRooms.length > 0,
		deletedActions: deletedActions.length,
		kickedUsers,
	};
}

function deleteUserData(input: { userId?: number | null; name?: string | null }) {
	const candidateUserId = input.userId;
	const userId =
		typeof candidateUserId === 'number' && Number.isInteger(candidateUserId) && candidateUserId > 0
			? candidateUserId
			: null;
	const name = sanitizePlayerName(input.name ?? '');
	if (!userId && !name) throw new HttpError('User id or name is required', 400);

	const matchingUsers = userId
		? db.select().from(users).where(eq(users.id, userId)).all()
		: db
				.select()
				.from(users)
				.all()
				.filter(user => userNameKey(user.name) === userNameKey(name ?? ''));
	if (matchingUsers.length === 0) {
		return { ok: true, userId, name, deletedUsers: [], affectedRooms: [] };
	}

	const userIds = matchingUsers.map(user => user.id);
	const affectedRooms = [
		...new Set(
			db
				.select({ roomCode: roomActions.roomCode })
				.from(roomActions)
				.where(inArray(roomActions.userId, userIds))
				.all()
				.map(action => action.roomCode),
		),
	];

	for (const userId of userIds) {
		broadcastUserDeleted(userId);
	}

	db.delete(roomActions).where(inArray(roomActions.userId, userIds)).run();
	db.delete(users).where(inArray(users.id, userIds)).run();

	for (const code of affectedRooms) {
		roomStateCache.delete(code);
		const state = loadRoomState(code);
		broadcastRoom(code, state);
	}

	return {
		ok: true,
		userId,
		name,
		deletedUsers: matchingUsers.map(user => ({ id: user.id, name: user.name })),
		affectedRooms,
	};
}

function applyPlayerNameAliases(): void {
	for (const [fromKey, toName] of playerNameAliases) {
		const timestamp = nowIso();
		for (const user of db.select().from(users).all()) {
			if (userNameKey(user.name) !== fromKey || user.name === toName) continue;
			db.update(users)
				.set({ name: toName, updatedAt: timestamp })
				.where(eq(users.id, user.id))
				.run();
		}

		const affectedRooms = new Set<string>();
		for (const row of db.select().from(roomActions).all()) {
			const action = readAction(row);
			if (!action || (action.type !== 'join' && action.type !== 'set-name')) continue;
			if (userNameKey(action.name) !== fromKey) continue;

			const nextPayload = JSON.stringify({ ...action, name: toName });
			if (nextPayload === row.payload) continue;
			db.update(roomActions).set({ payload: nextPayload }).where(eq(roomActions.id, row.id)).run();
			affectedRooms.add(row.roomCode);
		}

		for (const code of affectedRooms) {
			roomStateCache.delete(code);
		}
	}
}

applyPlayerNameAliases();

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
		players: game.players.map(player => canonicalPlayerName(player.name)),
		playerStats: playerHistoryStats(game),
		settings: state.settings,
		turns: game.turn,
		livesRemaining:
			game.status === 'lost' ? 0 : Math.max(0, game.settings.maxFuseTokens - game.fuseTokensUsed),
		hintsRemaining: game.hintTokens,
		maxLives: game.settings.maxFuseTokens,
		maxHints: game.settings.maxHintTokens,
	};
}

function adminHistoryForRoom(code: string): AdminHistoryGame[] {
	const state = createInitialOnlineRoomState();
	const games: AdminHistoryGame[] = [];
	let currentGameStartActionId: number | null = null;

	for (const row of getRoomActions(code)) {
		const beforePhase = state.phase;
		const beforeStatus = state.gameState?.status;
		const action = readAction(row);
		if (!action) continue;

		applyOnlineRoomAction(state, action);
		state.v = row.id;
		if (beforePhase !== 'playing' && state.phase === 'playing' && state.gameState) {
			currentGameStartActionId = row.id;
		}

		const nextStatus = state.gameState?.status;
		if (
			(!beforeStatus || !terminalStatus(beforeStatus)) &&
			nextStatus &&
			terminalStatus(nextStatus)
		) {
			const startActionId = currentGameStartActionId ?? row.id;
			const completed = completedGame(code, state, row.createdAt);
			if (completed) {
				games.push({
					...completed,
					id: historyGameId(code, startActionId, row.id),
					startActionId,
					endActionId: row.id,
				});
			}
			currentGameStartActionId = null;
		}

		if (beforePhase === 'playing' && state.phase === 'lobby') {
			currentGameStartActionId = null;
		}
	}

	return games;
}

function publicHistoryEntry(game: AdminHistoryGame): GameHistoryEntry {
	return {
		roomCode: game.roomCode,
		score: game.score,
		status: game.status,
		endedAt: game.endedAt,
		players: game.players,
		playerStats: game.playerStats,
		settings: game.settings,
		turns: game.turns,
		livesRemaining: game.livesRemaining,
		hintsRemaining: game.hintsRemaining,
		maxLives: game.maxLives,
		maxHints: game.maxHints,
	};
}

function activeRoomDirectory() {
	const allRooms = db.select().from(rooms).orderBy(desc(rooms.updatedAt)).all();
	const entries = allRooms
		.map(room => ({ code: room.code, state: loadRoomState(room.code) }))
		.filter(room => room.state.members.length > 0)
		.filter(room => !room.state.gameState || !terminalStatus(room.state.gameState.status));
	return selectRoomDirectoryListings(entries);
}

function currentRoomForUser(userId: number | null, clientKey: string | null): CurrentRoomResponse {
	const user = getUserByIdOrClientKey(userId, clientKey);
	if (!user) return { roomCode: null };

	const room = db
		.select()
		.from(rooms)
		.orderBy(desc(rooms.updatedAt))
		.all()
		.find(candidate =>
			loadRoomState(candidate.code).members.some(member => member.userId === user.id),
		);

	return { roomCode: room?.code ?? null };
}

function allHistory() {
	return allAdminHistory().map(publicHistoryEntry);
}

function allAdminHistory() {
	return db
		.select()
		.from(rooms)
		.orderBy(desc(rooms.updatedAt))
		.all()
		.flatMap(room => adminHistoryForRoom(room.code))
		.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

function adminHistoryUsers(games: AdminHistoryGame[]): AdminHistoryUser[] {
	const usersByKey = new Map<string, AdminHistoryUser>();

	for (const game of games) {
		const seenInGame = new Set<string>();
		const players = game.playerStats.length
			? game.playerStats.map(player => ({ id: player.id, name: player.name }))
			: game.players.map(name => ({ id: `name:${userNameKey(name)}`, name }));

		for (const player of players) {
			const userId = userIdFromPlayerId(player.id);
			const key = userId ? `user:${userId}` : `name:${userNameKey(player.name)}`;
			if (seenInGame.has(key)) continue;
			seenInGame.add(key);

			const existing = usersByKey.get(key);
			if (existing) {
				existing.gamesPlayed += 1;
				continue;
			}

			usersByKey.set(key, {
				id: key,
				userId,
				name: player.name,
				gamesPlayed: 1,
			});
		}
	}

	return [...usersByKey.values()].sort((a, b) => {
		if (a.gamesPlayed !== b.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
		return a.name.localeCompare(b.name);
	});
}

function adminSummary(): AdminSummaryResponse {
	const games = allAdminHistory();
	return {
		rooms: activeRoomDirectory(),
		users: adminHistoryUsers(games),
		games,
	};
}

function deleteGameData(gameId: string | null | undefined) {
	const target = parseHistoryGameId(gameId);
	if (!target) throw new HttpError('Invalid game id', 400);

	const currentGameId = historyGameId(target.roomCode, target.startActionId, target.endActionId);
	const exists = adminHistoryForRoom(target.roomCode).some(game => game.id === currentGameId);
	if (!exists) {
		return { ok: true, gameId: currentGameId, roomCode: target.roomCode, deletedActions: 0 };
	}

	const deletedActions = db
		.delete(roomActions)
		.where(
			and(
				eq(roomActions.roomCode, target.roomCode),
				gte(roomActions.id, target.startActionId),
				lte(roomActions.id, target.endActionId),
			),
		)
		.returning({ id: roomActions.id })
		.all();
	db.update(rooms).set({ updatedAt: nowIso() }).where(eq(rooms.code, target.roomCode)).run();
	roomStateCache.delete(target.roomCode);
	broadcastRoom(target.roomCode, loadRoomState(target.roomCode));

	return {
		ok: true,
		gameId: currentGameId,
		roomCode: target.roomCode,
		deletedActions: deletedActions.length,
	};
}

const server = Bun.serve({
	development: env.NODE_ENV !== 'production',
	idleTimeout: serverIdleTimeoutSeconds,
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
				if (url.pathname === '/version' && request.method === 'GET') {
					return json(await loadVersion());
				}

				if (url.pathname === '/users' && request.method === 'POST') {
					const body = await readBody<{
						userId?: number | null;
						clientKey?: string | null;
						name?: string;
					}>(request);
					return json({ user: ensureUser(body.userId ?? null, body.clientKey, body.name) });
				}

				if (url.pathname === '/rooms' && request.method === 'GET') {
					return json({ rooms: activeRoomDirectory() });
				}

				if (url.pathname === '/history' && request.method === 'GET') {
					return json({ games: allHistory() });
				}

				if (url.pathname === '/users/current-room' && request.method === 'GET') {
					const userId = Number(url.searchParams.get('userId'));
					return json(
						currentRoomForUser(
							Number.isInteger(userId) ? userId : null,
							url.searchParams.get('clientKey'),
						),
					);
				}

				if (url.pathname === '/admin/summary' && request.method === 'GET') {
					return json(adminSummary());
				}

				if (url.pathname === '/admin/delete-room' && request.method === 'POST') {
					const body = await readBody<{ roomCode?: string }>(request);
					const code = parseRoomCode(body.roomCode);
					if (!code) return json({ error: 'Invalid room code' }, { status: 400 });
					return json(deleteRoomData(code));
				}

				if (url.pathname === '/admin/delete-user' && request.method === 'POST') {
					const body = await readBody<{ userId?: number | null; name?: string | null }>(request);
					return json(deleteUserData(body));
				}

				if (url.pathname === '/admin/delete-game' && request.method === 'POST') {
					const body = await readBody<{ gameId?: string }>(request);
					return json(deleteGameData(body.gameId));
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
						const body = await readBody<{
							userId?: number | null;
							clientKey?: string | null;
							name?: string;
						}>(request);
						const user = ensureUser(body.userId ?? null, body.clientKey, body.name);
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
