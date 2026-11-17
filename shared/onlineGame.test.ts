import { expect, test } from 'bun:test';
import { HanabiGame, type PlayerId } from './game';
import {
	applyOnlineRoomAction,
	cloneLobbySettings,
	createInitialOnlineRoomState,
	reduceOnlineRoomActions,
	type OnlineRoomState,
	type RoomMember,
} from './onlineGame';

const PLAYERS: RoomMember[] = [
	{ id: 'player:1', userId: 1, name: 'Alex' },
	{ id: 'player:2', userId: 2, name: 'Blair' },
	{ id: 'player:3', userId: 3, name: 'Casey' },
];

function createState(overrides: Partial<OnlineRoomState> = {}): OnlineRoomState {
	return { ...createInitialOnlineRoomState(), ...overrides };
}

function ready(state: OnlineRoomState, actorId: PlayerId) {
	return applyOnlineRoomAction(state, { type: 'set-ready', actorId, ready: true });
}

const TWO_PLAYERS_READY = [
	{ type: 'join', actorId: 'player:1', userId: 1, name: 'Alex' },
	{ type: 'join', actorId: 'player:2', userId: 2, name: 'Blair' },
	{ type: 'set-ready', actorId: 'player:1', ready: true },
	{ type: 'set-ready', actorId: 'player:2', ready: true, shuffleSeed: 1234 },
] as const;

test('replaying the same room action log produces the same game', () => {
	const first = reduceOnlineRoomActions(TWO_PLAYERS_READY);
	const second = reduceOnlineRoomActions(TWO_PLAYERS_READY);

	expect(first.gameState).not.toBeNull();
	expect(first.gameState).toEqual(second.gameState);
});

test('any room member can change lobby settings', () => {
	const state = createState({ members: PLAYERS });

	expect(
		applyOnlineRoomAction(state, {
			type: 'set-settings',
			actorId: 'player:2',
			next: { endlessMode: true },
		}),
	).toBeTrue();
	expect(state.settings).toEqual({ ...cloneLobbySettings(), endlessMode: true });
});

test('the game starts only when every seated player is ready, and spectators are not dealt in', () => {
	const state = createState({ members: PLAYERS, spectatorIds: ['player:3'] });

	ready(state, 'player:1');
	expect(state.phase).toBe('lobby');
	ready(state, 'player:2');

	expect(state.phase).toBe('playing');
	expect(state.gameState?.players.map(player => player.id).sort()).toEqual([
		'player:1',
		'player:2',
	]);
});

test('a player who leaves loses their seat, ready mark and spectator mark', () => {
	const state = createState({
		members: PLAYERS.slice(0, 2),
		spectatorIds: ['player:1'],
		readyPlayerIds: ['player:1', 'player:2'],
	});

	applyOnlineRoomAction(state, { type: 'leave', actorId: 'player:1' });

	expect(state.members).toEqual([PLAYERS[1]]);
	expect(state.spectatorIds).toEqual([]);
	expect(state.readyPlayerIds).not.toContain('player:1');
});

test('rejoining a room mid-game keeps the player in their seat', () => {
	const state = reduceOnlineRoomActions([
		...TWO_PLAYERS_READY,
		{ type: 'join', actorId: 'player:1', userId: 1, name: 'Alex' },
	]);

	expect(state.phase).toBe('playing');
	expect(state.members.map(member => member.id)).toEqual(['player:1', 'player:2']);
	expect(state.gameState?.players.map(player => player.id)).toContain('player:1');
});

test('a seated player cannot become a spectator mid-game, but a waiting member can', () => {
	const state = createState({ members: PLAYERS.slice(0, 2) });
	ready(state, 'player:1');
	ready(state, 'player:2');
	state.members.push(PLAYERS[2]);

	expect(
		applyOnlineRoomAction(state, { type: 'set-spectator', actorId: 'player:1', spectator: true }),
	).toBeFalse();
	expect(
		applyOnlineRoomAction(state, { type: 'set-spectator', actorId: 'player:3', spectator: true }),
	).toBeTrue();
	expect(state.spectatorIds).toEqual(['player:3']);
});

test('only the player whose turn it is can act in the game', () => {
	const state = reduceOnlineRoomActions(TWO_PLAYERS_READY);
	const game = state.gameState!;
	const actorId = game.players[game.currentTurnPlayerIndex].id;
	const otherId = game.players.find(player => player.id !== actorId)!.id;
	const cardId = game.players[game.currentTurnPlayerIndex].cards[0];

	expect(
		applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId: otherId,
			action: { type: 'play', actorId: otherId, cardId },
		}),
	).toBeFalse();
	expect(
		applyOnlineRoomAction(state, {
			type: 'game-action',
			actorId,
			action: { type: 'play', actorId, cardId },
		}),
	).toBeTrue();
});

test('a finished game returns to the same lobby only after every seated player votes for a rematch', () => {
	const game = new HanabiGame({
		playerIds: ['player:1', 'player:2'],
		playerNames: ['Alex', 'Blair'],
	});
	game.state.status = 'won';
	const settings = { ...cloneLobbySettings(), includeBlack: true };
	const state = createState({
		phase: 'playing',
		members: PLAYERS,
		settings,
		gameState: game.getSnapshot(),
	});
	const vote = (actorId: PlayerId) =>
		applyOnlineRoomAction(state, { type: 'set-rematch', actorId, rematch: true });

	expect(vote('player:3')).toBeFalse();
	vote('player:1');
	expect(state.phase).toBe('playing');
	vote('player:2');

	expect(state.phase).toBe('lobby');
	expect(state.gameState).toBeNull();
	expect(state.members).toEqual(PLAYERS);
	expect(state.settings).toEqual(settings);
});
