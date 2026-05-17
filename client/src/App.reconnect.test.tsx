import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, mock, test } from 'bun:test';

void mock.module('./hooks/useGameServer', () => ({
	useOnlineRoom: () => ({
		room: null,
		user: { id: 1, name: 'Alex' },
		error: null,
		wasKicked: false,
		joinRoom: async () => null,
		reloadRoom: async () => null,
		sendAction: async () => null,
	}),
}));

import App from './App';

describe('App online reconnect state', () => {
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
});
