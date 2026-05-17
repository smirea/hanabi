import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const sendActionMock = mock(async () => null);
let mockRoom: unknown = null;

void mock.module('./hooks/useGameServer', () => ({
	useOnlineRoom: () => ({
		room: mockRoom,
		user: { id: 1, name: 'Alex' },
		error: null,
		wasKicked: false,
		joinRoom: async () => null,
		reloadRoom: async () => null,
		sendAction: sendActionMock,
	}),
}));

import App from './App';
import { HanabiGame } from './game';

function createFinishedRoom() {
	const game = new HanabiGame({
		playerIds: ['player:1', 'player:2'],
		playerNames: ['Alex', 'Blair'],
		shuffleSeed: 1234,
	});
	const gameState = game.getSnapshot();
	gameState.status = 'finished';
	gameState.logs.push({
		id: 'status-finished',
		turn: gameState.turn,
		type: 'status',
		status: 'finished',
		reason: 'final_round_complete',
		score: game.getScore(),
	});

	return {
		status: 'connected',
		selfId: '1',
		selfPlayerId: 'player:1',
		snapshotVersion: 4,
		phase: 'playing',
		members: [
			{ id: 'player:1', userId: 1, name: 'Alex', isTv: false, isReady: false },
			{ id: 'player:2', userId: 2, name: 'Blair', isTv: false, isReady: false },
		],
		settings: {
			includeMulticolor: false,
			multicolorShortDeck: false,
			multicolorWildHints: false,
			endlessMode: false,
		},
		gameState,
	};
}

describe('App online reconnect state', () => {
	beforeEach(() => {
		mockRoom = null;
		sendActionMock.mockClear();
	});

	afterEach(() => {
		cleanup();
		window.localStorage.clear();
	});

	test('does not show the lobby controls while rejoining a room', () => {
		window.localStorage.setItem('hanabi.debug_mode', 'false');

		render(<App roomCode='ABCD' />);

		expect(screen.getByText('Waiting for room snapshot in room ABCD.')).toBeInTheDocument();
		expect(screen.queryByTestId('lobby-start')).not.toBeInTheDocument();
	});

	test('endgame back to game only dismisses the local overlay', () => {
		window.localStorage.setItem('hanabi.debug_mode', 'false');
		mockRoom = createFinishedRoom();

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-screen')).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('endgame-back-game'));

		expect(screen.queryByTestId('endgame-screen')).not.toBeInTheDocument();
		expect(screen.getByTestId('table-shell')).toBeInTheDocument();
		expect(sendActionMock).not.toHaveBeenCalled();
	});
});
