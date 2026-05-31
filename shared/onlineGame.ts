import {
	HanabiGame,
	type CardNumber,
	type HanabiState,
	type PlayerId as GamePlayerId,
	type Suit,
} from './game';

export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYER_NAME_LENGTH = 24;
export const MIN_SEATED_PLAYER_COUNT = 2;
export const MAX_SEATED_PLAYER_COUNT = 5;

export interface LobbySettings {
	includeMulticolor: boolean;
	multicolorShortDeck: boolean;
	multicolorWildHints: boolean;
	endlessMode: boolean;
}

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
	includeMulticolor: false,
	multicolorShortDeck: false,
	multicolorWildHints: false,
	endlessMode: false,
};

export type RoomPhase = 'lobby' | 'playing';

export type GameAction =
	| { type: 'play'; actorId: GamePlayerId; cardId: string }
	| { type: 'discard'; actorId: GamePlayerId; cardId: string }
	| { type: 'hint-color'; actorId: GamePlayerId; targetPlayerId: GamePlayerId; suit: Suit }
	| {
			type: 'hint-number';
			actorId: GamePlayerId;
			targetPlayerId: GamePlayerId;
			number: CardNumber;
	  };

export interface RoomMember {
	id: GamePlayerId;
	userId: number;
	name: string;
}

export interface RoomMemberView extends RoomMember {
	isTv: boolean;
	isReady: boolean;
}

export interface OnlineRoomState {
	v: number;
	phase: RoomPhase;
	settings: LobbySettings;
	gameState: HanabiState | null;
	members: RoomMember[];
	spectatorIds: GamePlayerId[];
	readyPlayerIds: GamePlayerId[];
}

export type OnlineRoomAction =
	| { type: 'join'; actorId: GamePlayerId; userId: number; name: string }
	| { type: 'leave'; actorId: GamePlayerId }
	| { type: 'set-name'; actorId: GamePlayerId; name: string }
	| { type: 'set-settings'; actorId: GamePlayerId; next: Partial<LobbySettings> }
	| { type: 'set-spectator'; actorId: GamePlayerId; spectator: boolean }
	| { type: 'set-ready'; actorId: GamePlayerId; ready: boolean; shuffleSeed?: number }
	| { type: 'reset-room'; actorId: GamePlayerId }
	| { type: 'game-action'; actorId: GamePlayerId; action: GameAction };

export interface RoomViewState {
	status: 'idle' | 'connecting' | 'connected';
	selfId: string | null;
	selfPlayerId: GamePlayerId | null;
	snapshotVersion: number;
	phase: RoomPhase;
	members: RoomMemberView[];
	settings: LobbySettings;
	gameState: HanabiState | null;
}

export interface RoomDirectoryListing {
	code: string;
	players: string[];
	phase: RoomPhase;
}

export interface GameHistoryEntry {
	roomCode: string;
	score: number;
	status: NonNullable<HanabiState>['status'];
	endedAt: string;
	players: string[];
	settings: LobbySettings;
	turns: number;
}

export interface UserRecord {
	id: number;
	name: string;
}

export interface RoomResponse {
	room: RoomViewState;
}

export interface DirectoryResponse {
	rooms: RoomDirectoryListing[];
}

export interface HistoryResponse {
	games: GameHistoryEntry[];
}

export interface CurrentRoomResponse {
	roomCode: string | null;
}

export interface VersionResponse {
	committedAt: string | null;
}

export interface UserResponse {
	user: UserRecord;
}

export function playerIdForUser(userId: number): GamePlayerId {
	return `player:${userId}`;
}

export function cloneLobbySettings(
	settings: LobbySettings = DEFAULT_LOBBY_SETTINGS,
): LobbySettings {
	return { ...settings };
}

export function createInitialOnlineRoomState(): OnlineRoomState {
	return {
		v: 0,
		phase: 'lobby',
		settings: cloneLobbySettings(),
		gameState: null,
		members: [],
		spectatorIds: [],
		readyPlayerIds: [],
	};
}

export function normalizeSettings(input: Partial<LobbySettings> | undefined): LobbySettings {
	const includeMulticolor = Boolean(input?.includeMulticolor);
	return {
		includeMulticolor,
		multicolorShortDeck: includeMulticolor,
		multicolorWildHints: includeMulticolor,
		endlessMode: Boolean(input?.endlessMode),
	};
}

function areLobbySettingsEqual(left: LobbySettings, right: LobbySettings): boolean {
	return (
		left.includeMulticolor === right.includeMulticolor &&
		left.multicolorShortDeck === right.multicolorShortDeck &&
		left.multicolorWildHints === right.multicolorWildHints &&
		left.endlessMode === right.endlessMode
	);
}

export function sanitizePlayerName(value: string): string | null {
	const trimmed = value.trim().replace(/\s+/g, ' ');
	return trimmed.length === 0 ? null : trimmed.slice(0, MAX_PLAYER_NAME_LENGTH);
}

function getPlayerNameKey(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function disambiguatePlayerName(baseName: string, used: Set<string>): string {
	const key = getPlayerNameKey(baseName);
	if (!used.has(key)) return baseName;

	for (let suffix = 2; suffix < 100; suffix++) {
		const suffixText = ` ${suffix}`;
		const candidate = `${baseName.slice(0, Math.max(1, MAX_PLAYER_NAME_LENGTH - suffixText.length)).trimEnd()}${suffixText}`;
		if (!used.has(getPlayerNameKey(candidate))) return candidate;
	}

	return `${baseName.slice(0, MAX_PLAYER_NAME_LENGTH - 1).trimEnd()}*`;
}

function uniquePlayerIds(
	ids: readonly GamePlayerId[],
	members: readonly Pick<RoomMember, 'id'>[],
): GamePlayerId[] {
	const validIds = new Set(members.map(member => member.id));
	return [...new Set(ids)].filter(id => validIds.has(id));
}

function clearLobbyConsensus(state: OnlineRoomState): void {
	state.readyPlayerIds = [];
}

export function buildRoomMembers(
	members: readonly RoomMember[],
	spectatorIds: readonly GamePlayerId[],
	readyPlayerIds: readonly GamePlayerId[] = [],
): RoomMemberView[] {
	const spectatorSet = new Set(uniquePlayerIds(spectatorIds, members));
	const readySet = new Set(uniquePlayerIds(readyPlayerIds, members));
	const used = new Set<string>();

	return [...members]
		.sort((a, b) => a.userId - b.userId)
		.map((member, i) => {
			const baseName =
				sanitizePlayerName(member.name) ?? `Player ${String(i + 1).padStart(2, '0')}`;
			const name = disambiguatePlayerName(baseName, used);
			used.add(getPlayerNameKey(name));
			return {
				...member,
				name,
				isTv: spectatorSet.has(member.id),
				isReady: readySet.has(member.id),
			};
		});
}

export function selectRoomDirectoryListings(
	rooms: ReadonlyArray<{ code: string; state: OnlineRoomState }>,
): RoomDirectoryListing[] {
	return rooms
		.map(room => ({
			code: room.code,
			players: buildRoomMembers(
				room.state.members,
				room.state.spectatorIds,
				room.state.readyPlayerIds,
			).map(p => p.name),
			phase: room.state.phase,
		}))
		.sort((a, b) => a.code.localeCompare(b.code));
}

export function selectRoomViewState(
	state: OnlineRoomState | null,
	selfUserId: number | null,
	status: RoomViewState['status'] = state ? 'connected' : 'idle',
): RoomViewState {
	const selfPlayerId = selfUserId === null ? null : playerIdForUser(selfUserId);

	return {
		status,
		selfId: selfUserId === null ? null : String(selfUserId),
		selfPlayerId,
		snapshotVersion: state?.v ?? 0,
		phase: state?.phase ?? 'lobby',
		members: state ? buildRoomMembers(state.members, state.spectatorIds, state.readyPlayerIds) : [],
		settings: state?.settings ?? cloneLobbySettings(),
		gameState: state?.gameState ?? null,
	};
}

export function applyGameAction(game: HanabiGame, action: GameAction): void {
	const currentPlayer = game.state.players[game.state.currentTurnPlayerIndex];
	if (!currentPlayer) throw new Error('Current turn player is missing');
	if (currentPlayer.id !== action.actorId)
		throw new Error('Action actor is not the current turn player');

	switch (action.type) {
		case 'play':
			return game.playCard(action.cardId);
		case 'discard':
			return game.discardCard(action.cardId);
		case 'hint-color':
			return game.giveColorHint(action.targetPlayerId, action.suit);
		case 'hint-number':
			return game.giveNumberHint(action.targetPlayerId, action.number);
		default:
			throw new Error(`Unhandled action: ${JSON.stringify(action)}`);
	}
}

function getActorMember(state: OnlineRoomState, actorId: GamePlayerId): RoomMember | null {
	return state.members.find(member => member.id === actorId) ?? null;
}

function isTerminalGame(state: OnlineRoomState): boolean {
	const status = state.gameState?.status;
	return status === 'won' || status === 'lost' || status === 'finished';
}

function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function shuffleWithRandom<T>(items: T[], random: () => number): T[] {
	const shuffled = [...items];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
	}
	return shuffled;
}

function maybeStartGame(state: OnlineRoomState, shuffleSeed?: number): boolean {
	if (state.phase !== 'lobby') return false;

	const members = buildRoomMembers(state.members, state.spectatorIds, state.readyPlayerIds);
	const seated = members.filter(member => !member.isTv);
	if (seated.length < MIN_SEATED_PLAYER_COUNT || seated.length > MAX_SEATED_PLAYER_COUNT)
		return false;
	if (!seated.every(member => member.isReady)) return false;

	const random = shuffleSeed === undefined ? null : createSeededRandom(shuffleSeed);
	const orderedPlayers = random ? shuffleWithRandom(seated, random) : seated;
	const startingPlayerIndex = random ? Math.floor(random() * orderedPlayers.length) : 0;
	const game = new HanabiGame({
		playerIds: orderedPlayers.map(member => member.id),
		playerNames: orderedPlayers.map(member => member.name),
		startingPlayerIndex,
		shuffleSeed,
		...state.settings,
	});
	state.phase = 'playing';
	state.gameState = game.getSnapshot();
	state.readyPlayerIds = [];
	return true;
}

export function applyOnlineRoomAction(state: OnlineRoomState, action: OnlineRoomAction): boolean {
	state.settings = normalizeSettings(state.settings);
	state.spectatorIds = uniquePlayerIds(state.spectatorIds, state.members);
	state.readyPlayerIds = uniquePlayerIds(state.readyPlayerIds, state.members);

	if (action.type === 'join') {
		if (action.actorId !== playerIdForUser(action.userId)) return false;

		const name = sanitizePlayerName(action.name) ?? `Player ${action.userId}`;
		const existing = state.members.find(member => member.userId === action.userId);
		if (existing) {
			if (existing.name === name) return false;
			existing.name = name;
			clearLobbyConsensus(state);
			return true;
		}

		state.members.push({ id: action.actorId, userId: action.userId, name });
		clearLobbyConsensus(state);
		return true;
	}

	const actor = getActorMember(state, action.actorId);
	if (!actor) return false;

	switch (action.type) {
		case 'leave': {
			state.members = state.members.filter(member => member.id !== action.actorId);
			state.spectatorIds = state.spectatorIds.filter(id => id !== action.actorId);
			state.readyPlayerIds = state.readyPlayerIds.filter(id => id !== action.actorId);
			clearLobbyConsensus(state);
			return true;
		}
		case 'set-name': {
			const name = sanitizePlayerName(action.name);
			if (!name || actor.name === name) return false;

			actor.name = name;
			clearLobbyConsensus(state);
			return true;
		}
		case 'set-spectator': {
			const isSpectator = state.spectatorIds.includes(action.actorId);
			if (action.spectator === isSpectator) return false;
			if (
				state.phase === 'playing' &&
				state.gameState?.players.some(player => player.id === action.actorId)
			)
				return false;

			state.spectatorIds = action.spectator
				? uniquePlayerIds([...state.spectatorIds, action.actorId], state.members)
				: state.spectatorIds.filter(id => id !== action.actorId);
			clearLobbyConsensus(state);
			return true;
		}
		case 'set-settings': {
			if (state.phase !== 'lobby') return false;

			const nextSettings = normalizeSettings({ ...state.settings, ...action.next });
			if (areLobbySettingsEqual(state.settings, nextSettings)) return false;

			state.settings = nextSettings;
			clearLobbyConsensus(state);
			return true;
		}
		case 'set-ready': {
			if (state.phase !== 'lobby' || state.spectatorIds.includes(action.actorId)) return false;

			const wasReady = state.readyPlayerIds.includes(action.actorId);
			if (action.ready === wasReady) return false;

			state.readyPlayerIds = action.ready
				? uniquePlayerIds([...state.readyPlayerIds, action.actorId], state.members)
				: state.readyPlayerIds.filter(id => id !== action.actorId);

			maybeStartGame(state, action.shuffleSeed);
			return true;
		}
		case 'reset-room': {
			if (state.phase !== 'playing' || !isTerminalGame(state)) return false;

			state.phase = 'lobby';
			state.gameState = null;
			state.readyPlayerIds = [];
			return true;
		}
		case 'game-action': {
			if (
				state.phase !== 'playing' ||
				!state.gameState ||
				state.spectatorIds.includes(action.actorId)
			)
				return false;

			const game = HanabiGame.fromState(JSON.parse(JSON.stringify(state.gameState)));
			try {
				applyGameAction(game, action.action);
			} catch {
				return false;
			}

			state.gameState = game.getSnapshot();
			return true;
		}
	}
}

export function reduceOnlineRoomActions(actions: readonly OnlineRoomAction[]): OnlineRoomState {
	const state = createInitialOnlineRoomState();
	for (const action of actions) {
		applyOnlineRoomAction(state, action);
		state.v += 1;
	}
	return state;
}
