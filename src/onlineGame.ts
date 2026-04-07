import { HanabiGame, type PlayerId } from './game';
import {
	DEFAULT_LOBBY_SETTINGS,
	MAX_PLAYER_NAME_LENGTH,
	MAX_SEATED_PLAYER_COUNT,
	MIN_SEATED_PLAYER_COUNT,
	NETWORK_APP_ID,
} from './utils/constants';
import Networking, { type RoomId } from './utils/networking';
import type {
	GameAction,
	LobbySettings,
	OnlineRoomAction,
	OnlineRoomState,
	RoomDirectoryListing,
	RoomMemberView,
	RoomPresencePlayer,
	RoomViewState,
} from './utils/types';

export function cloneLobbySettings(settings: LobbySettings = DEFAULT_LOBBY_SETTINGS): LobbySettings {
	return { ...settings };
}

export function createInitialOnlineRoomState(): OnlineRoomState {
	return {
		v: 0,
		phase: 'lobby',
		settings: cloneLobbySettings(),
		gameState: null,
		spectatorIds: [],
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

function getActiveSpectatorIds(
	players: readonly Pick<RoomPresencePlayer, 'id'>[],
	spectatorIds: readonly PlayerId[],
): PlayerId[] {
	const validIds = new Set(players.map(p => p.id));
	return [...new Set(spectatorIds)].filter(id => validIds.has(id));
}

export function buildRoomMembers(
	players: readonly RoomPresencePlayer[],
	spectatorIds: readonly PlayerId[],
): RoomMemberView[] {
	const spectatorSet = new Set(getActiveSpectatorIds(players, spectatorIds));
	const used = new Set<string>();

	return [...players]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((player, i) => {
			const baseName = sanitizePlayerName(player.name) ?? `Player ${String(i + 1).padStart(2, '0')}`;
			const name = disambiguatePlayerName(baseName, used);
			used.add(getPlayerNameKey(name));
			return { id: player.id, peerId: player.peerId, name, isTv: spectatorSet.has(player.id) };
		});
}

type PresencePlayerRecord = Record<string, { id: PlayerId; peerId: string; name: string; room: RoomId | null }>;

export function selectRoomPlayers(players: PresencePlayerRecord, roomId: RoomId | null): RoomPresencePlayer[] {
	if (!roomId) return [];
	return Object.values(players)
		.filter(p => p.room === roomId)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(({ id, peerId, name }) => ({ id, peerId, name }));
}

export function selectRoomMembers(
	players: PresencePlayerRecord,
	roomId: RoomId | null,
	roomState: OnlineRoomState | null,
): RoomMemberView[] {
	return buildRoomMembers(selectRoomPlayers(players, roomId), roomState?.spectatorIds ?? []);
}

export function selectRoomDirectoryListings(
	rooms: ReadonlyArray<{ id: RoomId; players: readonly RoomPresencePlayer[] }>,
): RoomDirectoryListing[] {
	return rooms
		.map(room => ({
			code: room.id.slice('room:'.length),
			players: buildRoomMembers(room.players, []).map(p => p.name),
		}))
		.sort((a, b) => a.code.localeCompare(b.code));
}

export type OnlineNetworking = Networking<OnlineRoomState, OnlineRoomAction>;

let onlineNetworkingSingleton: OnlineNetworking | null = null;

export function getOnlineNetworking(): OnlineNetworking {
	if (onlineNetworkingSingleton) return onlineNetworkingSingleton;

	let networking!: OnlineNetworking;
	networking = new Networking<OnlineRoomState, OnlineRoomAction>({
		appId: `${NETWORK_APP_ID}.${window.location.hostname}`,
		getNewGameState: createInitialOnlineRoomState,
		gameReducer: (state, action) => {
			const roomId = networking.state.self.room;
			const players = selectRoomPlayers(networking.state.players as PresencePlayerRecord, roomId);
			const host = networking.getGameRoomHost();

			return applyOnlineRoomAction(state, action, {
				actorPlayerId: action.actorId,
				hostPlayerId: host?.id ?? null,
				players,
			});
		},
	});
	onlineNetworkingSingleton = networking;
	return networking;
}

export function selectRoomViewState(networking: OnlineNetworking): RoomViewState {
	const { self, gameReady, game, players } = networking.state;
	const roomId = self.room;
	const hasRoomState = Boolean(roomId && (gameReady || self.isHost));
	const roomState = hasRoomState ? game : null;
	const host = roomId ? networking.getGameRoomHost() : null;

	return {
		status: roomId ? (hasRoomState ? 'connected' : 'connecting') : 'idle',
		selfId: self.peerId ?? null,
		selfPlayerId: self.id ?? null,
		hostId: host?.peerId ?? null,
		isHost: roomId ? self.isHost : false,
		snapshotVersion: hasRoomState ? game.v : 0,
		phase: roomState?.phase ?? 'lobby',
		members: selectRoomMembers(players as PresencePlayerRecord, roomId, roomState),
		settings: roomState?.settings ?? cloneLobbySettings(),
		gameState: roomState?.gameState ?? null,
	};
}

export function applyGameAction(game: HanabiGame, action: GameAction): void {
	const currentPlayer = game.state.players[game.state.currentTurnPlayerIndex];
	if (!currentPlayer) throw new Error('Current turn player is missing');
	if (currentPlayer.id !== action.actorId) throw new Error('Action actor is not the current turn player');

	switch (action.type) {
		case 'play':
			return void game.playCard(action.cardId);
		case 'discard':
			return void game.discardCard(action.cardId);
		case 'hint-color':
			return void game.giveColorHint(action.targetPlayerId, action.suit);
		case 'hint-number':
			return void game.giveNumberHint(action.targetPlayerId, action.number);
		default:
			throw new Error(`Unhandled action: ${JSON.stringify(action)}`);
	}
}

export function applyOnlineRoomAction(
	state: OnlineRoomState,
	action: OnlineRoomAction,
	context: {
		actorPlayerId: PlayerId | null;
		hostPlayerId: PlayerId | null;
		players: readonly RoomPresencePlayer[];
	},
): boolean {
	const activeSpectatorIds = getActiveSpectatorIds(context.players, state.spectatorIds);
	state.settings = normalizeSettings(state.settings);
	state.spectatorIds = activeSpectatorIds;

	if (!context.actorPlayerId || action.actorId !== context.actorPlayerId) return false;

	const playerIds = new Set(context.players.map(p => p.id));
	if (!playerIds.has(action.actorId)) return false;

	switch (action.type) {
		case 'set-spectator': {
			if (action.spectator === activeSpectatorIds.includes(action.actorId)) return false;
			if (state.phase === 'playing' && state.gameState?.players.some(p => p.id === action.actorId)) return false;

			state.spectatorIds = getActiveSpectatorIds(
				context.players,
				action.spectator
					? [...activeSpectatorIds, action.actorId]
					: activeSpectatorIds.filter(id => id !== action.actorId),
			);
			return true;
		}
		case 'set-settings': {
			if (context.hostPlayerId !== action.actorId || state.phase !== 'lobby') return false;

			const nextSettings = normalizeSettings({ ...state.settings, ...action.next });
			if (areLobbySettingsEqual(state.settings, nextSettings)) return false;

			state.settings = nextSettings;
			return true;
		}
		case 'start-game': {
			if (context.hostPlayerId !== action.actorId || state.phase !== 'lobby') return false;

			const seated = buildRoomMembers(context.players, activeSpectatorIds).filter(m => !m.isTv);
			if (seated.length < MIN_SEATED_PLAYER_COUNT || seated.length > MAX_SEATED_PLAYER_COUNT) return false;

			const game = new HanabiGame({
				playerIds: seated.map(m => m.id),
				playerNames: seated.map(m => m.name),
				...state.settings,
			});
			state.phase = 'playing';
			state.gameState = game.getSnapshot();
			return true;
		}
		case 'game-action': {
			if (state.phase !== 'playing' || !state.gameState || activeSpectatorIds.includes(action.actorId)) return false;

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

export type { LobbySettings, OnlineRoomAction, OnlineRoomState, RoomDirectoryListing, RoomMemberView, RoomViewState };
