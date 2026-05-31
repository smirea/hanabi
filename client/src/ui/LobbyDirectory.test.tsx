import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const navigateMock = mock(() => {});

void mock.module('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock,
}));

void mock.module('../hooks/useGameServer', () => ({
	useAppVersion: () => ({ versionText: 'version 05 31, 2026 @ 12:34' }),
	useRoomDirectory: () => ({ rooms: [], reloadDirectory: async () => {} }),
}));

import { LobbyDirectory } from './LobbyDirectory';

describe('LobbyDirectory', () => {
	beforeEach(() => {
		navigateMock.mockClear();
		window.history.replaceState(null, '', '/');
		window.location.hash = '';
	});

	afterEach(() => {
		cleanup();
	});

	test('joins a room with initialized persistent search params', () => {
		window.history.replaceState(null, '', '/?DEBUG_ID=tab-2');

		render(<LobbyDirectory />);

		fireEvent.change(screen.getByTestId('room-directory-join-input'), {
			target: { value: 'ABCD' },
		});

		expect(navigateMock).toHaveBeenCalledWith({
			to: '/',
			search: { room: 'ABCD' },
			hash: '',
		});
	});

	test('renders create room button', () => {
		render(<LobbyDirectory />);
		expect(screen.getByTestId('room-directory-create')).toBeInTheDocument();
	});

	test('renders the faint server version under the title', () => {
		render(<LobbyDirectory />);
		expect(screen.getByTestId('room-directory-version')).toHaveTextContent(
			'version 05 31, 2026 @ 12:34',
		);
	});
});
