import { describe, expect, test } from 'bun:test';
import type { PlayerId } from './game';
import type { OnlineRoomState, RoomMember } from './utils/types';
import {
	applyOnlineRoomAction,
	buildRoomMembers,
	cloneLobbySettings,
	createInitialOnlineRoomState,
	reduceOnlineRoomActions,
	selectRoomDirectoryListings,
} from './onlineGame';

const PLAYERS: RoomMember[] = [
	{ id: 'player:1' as PlayerId, userId: 1, name: 'Alex' },
	{ id: 'player:2' as PlayerId, userId: 2, name: 'Alex' },
	{ id: 'player:3' as PlayerId, userId: 3, name: 'Casey' },
];

function createState(overrides: Partial<OnlineRoomState> = {}): OnlineRoomState {
	return {
		...createInitialOnlineRoomState(),
		...overrides,
	};
}

function ready(state: OnlineRoomState, actorId: PlayerId) {
	return applyOnlineRoomAction(state, { type: 'set-ready', actorId, ready: true });
}

describe('onlineGame', () => {
	test('buildRoomMembers deduplicates names and marks spectators and ready players', () => {
		expect(buildRoomMembers(PLAYERS, ['player:2' as PlayerId], ['player:1' as PlayerId])).toEqual([
			{ id: 'player:1', userId: 1, name: 'Alex', isTv: false, isReady: true },
			{ id: 'player:2', userId: 2, name: 'Alex 2', isTv: true, isReady: false },
			{ id: 'player:3', userId: 3, name: 'Casey', isTv: false, isReady: false },
		]);
	});

	test('room directory rows come from replayed room state', () => {
		expect(
			selectRoomDirectoryListings([
				{ code: 'BRVO', state: createState({ members: [PLAYERS[2]] }) },
				{ code: 'ALFA', state: createState({ members: PLAYERS.slice(0, 2) }) },
			]),
		).toEqual([
			{ code: 'ALFA', players: ['Alex', 'Alex 2'], phase: 'lobby' },
			{ code: 'BRVO', players: ['Casey'], phase: 'lobby' },
		]);
	});

	test('leave removes room membership and lobby state', () => {
		const state = createState({
			members: PLAYERS.slice(0, 2),
			spectatorIds: ['player:1' as PlayerId],
			readyPlayerIds: ['player:1' as PlayerId, 'player:2' as PlayerId],
		});

		expect(applyOnlineRoomAction(state, { type: 'leave', actorId: 'player:1' })).toBeTrue();

		expect(state.members).toEqual([PLAYERS[1]]);
		expect(state.spectatorIds).toEqual([]);
		expect(state.readyPlayerIds).toEqual([]);
	});

	test('any room member can update settings in the lobby', () => {
		const state = createState({ members: PLAYERS });
		const changed = applyOnlineRoomAction(state, {
			type: 'set-settings',
			actorId: 'player:2',
			next: { endlessMode: true },
		});

		expect(changed).toBeTrue();
		expect(state.settings).toEqual({ ...cloneLobbySettings(), endlessMode: true });
	});

	test('game starts only when all seated players are ready', () => {
		const state = createState({
			members: PLAYERS,
			spectatorIds: ['player:3' as PlayerId],
		});

		expect(ready(state, 'player:1')).toBeTrue();
		expect(state.phase).toBe('lobby');
		expect(ready(state, 'player:2')).toBeTrue();

		expect(state.phase).toBe('playing');
		expect(state.gameState?.players.map(player => player.id)).toEqual(['player:1', 'player:2']);
	});

	test('ready consensus can replay the same seeded initial game from the action log', () => {
		const actions = [
			{ type: 'join', actorId: 'player:1', userId: 1, name: 'Alex' },
			{ type: 'join', actorId: 'player:2', userId: 2, name: 'Blair' },
			{ type: 'set-ready', actorId: 'player:1', ready: true },
			{ type: 'set-ready', actorId: 'player:2', ready: true, shuffleSeed: 1234 },
		] as const;

		const first = reduceOnlineRoomActions(actions);
		const second = reduceOnlineRoomActions(actions);

		expect(first.gameState?.drawDeck).toEqual(second.gameState?.drawDeck);
		expect(first.gameState?.players).toEqual(second.gameState?.players);
	});

	test('rejoining a playing room preserves the active player seat', () => {
		const actions = [
			{ type: 'join', actorId: 'player:1', userId: 1, name: 'Alex' },
			{ type: 'join', actorId: 'player:2', userId: 2, name: 'Blair' },
			{ type: 'set-ready', actorId: 'player:1', ready: true },
			{ type: 'set-ready', actorId: 'player:2', ready: true, shuffleSeed: 1234 },
			{ type: 'join', actorId: 'player:1', userId: 1, name: 'Alex' },
		] as const;

		const state = reduceOnlineRoomActions(actions);

		expect(state.phase).toBe('playing');
		expect(state.members.map(member => member.id)).toEqual(['player:1', 'player:2']);
		expect(state.gameState?.players.map(player => player.id)).toContain('player:1');
	});

	test('spectator toggles are room-local and reject active players mid-game', () => {
		const playingState = createState({
			members: PLAYERS.slice(0, 2),
		});
		ready(playingState, 'player:1');
		ready(playingState, 'player:2');

		const activePlayerToggle = applyOnlineRoomAction(playingState, {
			type: 'set-spectator',
			actorId: 'player:1',
			spectator: true,
		});

		playingState.members.push(PLAYERS[2]);
		const waitingPlayerToggle = applyOnlineRoomAction(playingState, {
			type: 'set-spectator',
			actorId: 'player:3',
			spectator: true,
		});

		expect(activePlayerToggle).toBeFalse();
		expect(waitingPlayerToggle).toBeTrue();
		expect(playingState.spectatorIds).toEqual(['player:3']);
	});

	test('game actions require the current acting player and mutate game state when valid', () => {
		const state = createState({ members: PLAYERS.slice(0, 2) });
		ready(state, 'player:1');
		ready(state, 'player:2');

		if (!state.gameState) {
			throw new Error('expected game state');
		}

		const actorId = state.gameState.players[state.gameState.currentTurnPlayerIndex]?.id as PlayerId;
		const wrongActorId = state.gameState.players.find(player => player.id !== actorId)
			?.id as PlayerId;
		const cardId = state.gameState.players.find(player => player.id === actorId)?.cards[0];
		if (!cardId) {
			throw new Error('expected a card');
		}

		const rejected = applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId: wrongActorId,
			action: { type: 'play', actorId: wrongActorId, cardId },
		});
		const accepted = applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId,
			action: { type: 'play', actorId, cardId },
		});

		expect(rejected).toBeFalse();
		expect(accepted).toBeTrue();
		expect(state.gameState.turn).toBeGreaterThan(1);
	});
});
