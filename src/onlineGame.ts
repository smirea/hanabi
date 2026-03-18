import { HanabiGame, type PlayerId } from './game';
import { getScopedNetworkAppId } from './networkConstants';
import {
	DEFAULT_LOBBY_SETTINGS,
	MAX_PLAYER_NAME_LENGTH,
	MAX_SEATED_PLAYER_COUNT,
	MIN_SEATED_PLAYER_COUNT,
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
	return {
		includeMulticolor: settings.includeMulticolor,
		multicolorShortDeck: settings.multicolorShortDeck,
		multicolorWildHints: settings.multicolorWildHints,
		endlessMode: settings.endlessMode,
	};
}

export function createInitialOnlineRoomState(): OnlineRoomState {
	return {
		phase: 'lobby',
		settings: cloneLobbySettings(),
		gameState: null,
		spectatorIds: [],
	};
}

export function normalizeSettings(input: Partial<LobbySettings> | undefined): LobbySettings {
	const includeMulticolor = Boolean(input?.includeMulticolor);
	const multicolorShortDeck = includeMulticolor;
	const multicolorWildHints = includeMulticolor;
	const endlessMode = Boolean(input?.endlessMode);

	return {
		includeMulticolor,
		multicolorShortDeck,
		multicolorWildHints,
		endlessMode,
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
	if (trimmed.length === 0) {
		return null;
	}

	return trimmed.slice(0, MAX_PLAYER_NAME_LENGTH);
}

function getPlayerNameKey(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function disambiguatePlayerName(baseName: string, used: Set<string>): string {
	const normalizedBase = getPlayerNameKey(baseName);
	if (!used.has(normalizedBase)) {
		return baseName;
	}

	for (let suffix = 2; suffix < 100; suffix += 1) {
		const suffixText = ` ${suffix}`;
		const maxBaseLength = Math.max(1, MAX_PLAYER_NAME_LENGTH - suffixText.length);
		const trimmedBase = baseName.slice(0, maxBaseLength).trimEnd();
		const candidate = `${trimmedBase}${suffixText}`;
		const normalizedCandidate = getPlayerNameKey(candidate);
		if (!used.has(normalizedCandidate)) {
			return candidate;
		}
	}

	return `${baseName.slice(0, MAX_PLAYER_NAME_LENGTH - 1).trimEnd()}*`;
}

export function buildRoomMembers(
	players: readonly RoomPresencePlayer[],
	spectatorIds: readonly PlayerId[],
): RoomMemberView[] {
	const spectatorSet = new Set(getActiveSpectatorIds(players, spectatorIds));
	const used = new Set<string>();

	return [...players]
		.sort((left, right) => left.id.localeCompare(right.id))
		.map((player, index) => {
			const fallbackName = `Player ${String(index + 1).padStart(2, '0')}`;
			const baseName = sanitizePlayerName(player.name) ?? fallbackName;
			const name = disambiguatePlayerName(baseName, used);
			used.add(getPlayerNameKey(name));

			return {
				id: player.id,
				peerId: player.peerId,
				name,
				isTv: spectatorSet.has(player.id),
			};
		});
}

function getActiveSpectatorIds(
	players: readonly Pick<RoomPresencePlayer, 'id'>[],
	spectatorIds: readonly PlayerId[],
): PlayerId[] {
	const validIds = new Set(players.map(player => player.id));
	const seen = new Set<PlayerId>();
	const activeSpectators: PlayerId[] = [];

	for (const spectatorId of spectatorIds) {
		if (!validIds.has(spectatorId) || seen.has(spectatorId)) {
			continue;
		}

		seen.add(spectatorId);
		activeSpectators.push(spectatorId);
	}

	return activeSpectators;
}

type PresencePlayerRecord = Record<
	string,
	{
		id: PlayerId;
		peerId: string;
		name: string;
		room: RoomId | null;
	}
>;

export function selectRoomPlayers(players: PresencePlayerRecord, roomId: RoomId | null): RoomPresencePlayer[] {
	if (!roomId) {
		return [];
	}

	return Object.values(players)
		.filter(player => player.room === roomId)
		.sort((left, right) => left.id.localeCompare(right.id))
		.map(player => ({
			id: player.id,
			peerId: player.peerId,
			name: player.name,
		}));
}

export function selectRoomMembers(
	players: PresencePlayerRecord,
	roomId: RoomId | null,
	roomState: OnlineRoomState | null,
): RoomMemberView[] {
	return buildRoomMembers(selectRoomPlayers(players, roomId), roomState?.spectatorIds ?? []);
}

export function selectRoomDirectoryListings(
	lobbies: ReadonlyArray<{
		id: RoomId;
		players: ReadonlyArray<Pick<RoomPresencePlayer, 'id' | 'peerId' | 'name'>>;
	}>,
): RoomDirectoryListing[] {
	return lobbies
		.map(room => ({
			code: room.id.slice('room:'.length),
			players: buildRoomMembers(
				room.players.map(player => ({
					id: player.id,
					peerId: player.peerId,
					name: player.name,
				})),
				[],
			).map(player => player.name),
		}))
		.sort((left, right) => left.code.localeCompare(right.code));
}

export type OnlineNetworking = Networking<OnlineRoomState, OnlineRoomAction>;

let onlineNetworkingSingleton: OnlineNetworking | null = null;

export function getOnlineNetworking(): OnlineNetworking {
	if (onlineNetworkingSingleton) {
		return onlineNetworkingSingleton;
	}

	let networking!: OnlineNetworking;
	networking = new Networking<OnlineRoomState, OnlineRoomAction>({
		appId: getScopedNetworkAppId(),
		getNewGameState: createInitialOnlineRoomState,
		applyAction: (state, action) => {
			const roomId = networking.gameRoom?.roomId ?? null;
			const players = selectRoomPlayers(networking.playerRoom.state.players as PresencePlayerRecord, roomId);
			const hostPeerId = networking.state.gameRoom.host;

			return applyOnlineRoomAction(state, action, {
				actorPlayerId: action.actorId,
				hostPlayerId: hostPeerId ? (networking.playerRoom.get(hostPeerId)?.id ?? null) : null,
				players,
			});
		},
	});
	onlineNetworkingSingleton = networking;
	return networking;
}

export function selectRoomViewState(networking: OnlineNetworking): RoomViewState {
	const self = networking.playerRoom.state.self;
	const roomId = self.room;
	const gameRoomState = networking.state.gameRoom;
	const hasRoomState = Boolean(roomId && (gameRoomState.ready || gameRoomState.host === self.peerId));
	const roomState = hasRoomState ? gameRoomState.game : null;

	return {
		status: roomId ? (hasRoomState ? 'connected' : 'connecting') : 'idle',
		selfId: self.peerId ?? null,
		selfPlayerId: self.id ?? null,
		hostId: roomId ? (gameRoomState.host ?? null) : null,
		isHost: roomId ? gameRoomState.host === self.peerId : false,
		snapshotVersion: roomId && hasRoomState ? gameRoomState.v : 0,
		phase: roomState?.phase ?? 'lobby',
		members: selectRoomMembers(networking.playerRoom.state.players as PresencePlayerRecord, roomId, roomState),
		settings: roomState?.settings ?? cloneLobbySettings(),
		gameState: roomState?.gameState ?? null,
	};
}

export function applyGameAction(game: HanabiGame, action: GameAction): void {
	const currentPlayer = game.state.players[game.state.currentTurnPlayerIndex];
	if (!currentPlayer) {
		throw new Error('Current turn player is missing');
	}

	if (currentPlayer.id !== action.actorId) {
		throw new Error('Action actor is not the current turn player');
	}

	switch (action.type) {
		case 'play':
			game.playCard(action.cardId);
			return;
		case 'discard':
			game.discardCard(action.cardId);
			return;
		case 'hint-color':
			game.giveColorHint(action.targetPlayerId, action.suit);
			return;
		case 'hint-number':
			game.giveNumberHint(action.targetPlayerId, action.number);
			return;
		default:
			return assertNever(action);
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

	if (!context.actorPlayerId || action.actorId !== context.actorPlayerId) {
		return false;
	}

	const playerIds = new Set(context.players.map(player => player.id));
	if (!playerIds.has(action.actorId)) {
		return false;
	}

	switch (action.type) {
		case 'set-spectator': {
			const isCurrentSpectator = activeSpectatorIds.includes(action.actorId);
			if (action.spectator === isCurrentSpectator) {
				return false;
			}

			const isCurrentParticipant = Boolean(state.gameState?.players.some(player => player.id === action.actorId));
			if (state.phase === 'playing' && isCurrentParticipant) {
				return false;
			}

			state.spectatorIds = getActiveSpectatorIds(
				context.players,
				action.spectator
					? [...activeSpectatorIds, action.actorId]
					: activeSpectatorIds.filter(spectatorId => spectatorId !== action.actorId),
			);
			return true;
		}
		case 'set-settings': {
			if (context.hostPlayerId !== action.actorId || state.phase !== 'lobby') {
				return false;
			}

			const nextSettings = normalizeSettings({
				...state.settings,
				...action.next,
			});
			if (areLobbySettingsEqual(state.settings, nextSettings)) {
				return false;
			}

			state.settings = nextSettings;
			return true;
		}
		case 'start-game': {
			if (context.hostPlayerId !== action.actorId || state.phase !== 'lobby') {
				return false;
			}

			const seatedMembers = buildRoomMembers(context.players, activeSpectatorIds).filter(member => !member.isTv);
			if (seatedMembers.length < MIN_SEATED_PLAYER_COUNT || seatedMembers.length > MAX_SEATED_PLAYER_COUNT) {
				return false;
			}

			const game = new HanabiGame({
				playerIds: seatedMembers.map(member => member.id),
				playerNames: seatedMembers.map(member => member.name),
				includeMulticolor: state.settings.includeMulticolor,
				multicolorShortDeck: state.settings.multicolorShortDeck,
				multicolorWildHints: state.settings.multicolorWildHints,
				endlessMode: state.settings.endlessMode,
			});
			state.phase = 'playing';
			state.gameState = game.getSnapshot();
			return true;
		}
		case 'game-action': {
			if (state.phase !== 'playing' || state.gameState === null || activeSpectatorIds.includes(action.actorId)) {
				return false;
			}

			const game = HanabiGame.fromState(JSON.parse(JSON.stringify(state.gameState)));
			try {
				applyGameAction(game, action.action);
			} catch {
				return false;
			}

			state.gameState = game.getSnapshot();
			return true;
		}
		default:
			return assertNever(action);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unhandled action: ${JSON.stringify(value)}`);
}

export type { LobbySettings, OnlineRoomAction, OnlineRoomState, RoomDirectoryListing, RoomMemberView, RoomViewState };
