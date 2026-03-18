import { describe, expect, test } from 'bun:test';

import type { PlayerId } from './game';
import type { OnlineRoomState, RoomPresencePlayer } from './utils/types';
import {
	applyOnlineRoomAction,
	buildRoomMembers,
	cloneLobbySettings,
	createInitialOnlineRoomState,
} from './onlineRoomShared';

const PLAYERS: RoomPresencePlayer[] = [
	{ id: 'player:1' as PlayerId, peerId: 'peer-1', name: 'Alex' },
	{ id: 'player:2' as PlayerId, peerId: 'peer-2', name: 'Alex' },
	{ id: 'player:3' as PlayerId, peerId: 'peer-3', name: 'Casey' },
];

function createState(overrides: Partial<OnlineRoomState> = {}): OnlineRoomState {
	return {
		...createInitialOnlineRoomState(),
		...overrides,
	};
}

describe('onlineRoomShared', () => {
	test('buildRoomMembers deduplicates names and marks spectators', () => {
		expect(buildRoomMembers(PLAYERS, ['player:2' as PlayerId])).toEqual([
			{ id: 'player:1', peerId: 'peer-1', name: 'Alex', isTv: false },
			{ id: 'player:2', peerId: 'peer-2', name: 'Alex 2', isTv: true },
			{ id: 'player:3', peerId: 'peer-3', name: 'Casey', isTv: false },
		]);
	});

	test('only the host can update settings in the lobby', () => {
		const state = createState();
		const changed = applyOnlineRoomAction(
			state,
			{
				type: 'set-settings',
				actorId: 'player:2',
				next: { endlessMode: true },
			},
			{
				actorPlayerId: 'player:2',
				hostPlayerId: 'player:1',
				players: PLAYERS,
			},
		);

		expect(changed).toBeFalse();
		expect(state.settings).toEqual(cloneLobbySettings());
	});

	test('start-game uses non-spectators and stable player ids', () => {
		const state = createState({
			spectatorIds: ['player:3' as PlayerId],
		});
		const changed = applyOnlineRoomAction(
			state,
			{
				type: 'start-game',
				actorId: 'player:1',
			},
			{
				actorPlayerId: 'player:1',
				hostPlayerId: 'player:1',
				players: PLAYERS,
			},
		);

		expect(changed).toBeTrue();
		expect(state.phase).toBe('playing');
		expect(state.gameState?.players.map(player => player.id)).toEqual(['player:1', 'player:2']);
	});

	test('spectator toggles are room-local and reject active players mid-game', () => {
		const playingState = createState({
			spectatorIds: [],
		});
		applyOnlineRoomAction(
			playingState,
			{
				type: 'start-game',
				actorId: 'player:1',
			},
			{
				actorPlayerId: 'player:1',
				hostPlayerId: 'player:1',
				players: PLAYERS.slice(0, 2),
			},
		);

		const activePlayerToggle = applyOnlineRoomAction(
			playingState,
			{
				type: 'set-spectator',
				actorId: 'player:1',
				spectator: true,
			},
			{
				actorPlayerId: 'player:1',
				hostPlayerId: 'player:1',
				players: PLAYERS,
			},
		);
		const waitingPlayerToggle = applyOnlineRoomAction(
			playingState,
			{
				type: 'set-spectator',
				actorId: 'player:3',
				spectator: true,
			},
			{
				actorPlayerId: 'player:3',
				hostPlayerId: 'player:1',
				players: PLAYERS,
			},
		);

		expect(activePlayerToggle).toBeFalse();
		expect(waitingPlayerToggle).toBeTrue();
		expect(playingState.spectatorIds).toEqual(['player:3']);
	});

	test('game actions require the acting player and mutate game state when valid', () => {
		const state = createState();
		applyOnlineRoomAction(
			state,
			{
				type: 'start-game',
				actorId: 'player:1',
			},
			{
				actorPlayerId: 'player:1',
				hostPlayerId: 'player:1',
				players: PLAYERS.slice(0, 2),
			},
		);

		if (!state.gameState) {
			throw new Error('expected game state');
		}

		const actorId = state.gameState.players[state.gameState.currentTurnPlayerIndex]?.id as PlayerId;
		const wrongActorId = state.gameState.players.find(player => player.id !== actorId)?.id as PlayerId;
		const cardId = state.gameState.players.find(player => player.id === actorId)?.cards[0];
		if (!cardId) {
			throw new Error('expected a card');
		}

		const rejected = applyOnlineRoomAction(
			state,
			{
				type: 'game-action',
				actorId: wrongActorId,
				action: { type: 'play', actorId: wrongActorId, cardId },
			},
			{
				actorPlayerId: wrongActorId,
				hostPlayerId: 'player:1',
				players: PLAYERS.slice(0, 2),
			},
		);
		const accepted = applyOnlineRoomAction(
			state,
			{
				type: 'game-action',
				actorId,
				action: { type: 'play', actorId, cardId },
			},
			{
				actorPlayerId: actorId,
				hostPlayerId: 'player:1',
				players: PLAYERS.slice(0, 2),
			},
		);

		expect(rejected).toBeFalse();
		expect(accepted).toBeTrue();
		expect(state.gameState.turn).toBeGreaterThan(1);
	});
});
