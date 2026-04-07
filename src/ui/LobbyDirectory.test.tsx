import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const navigateMock = mock(() => {});

void mock.module('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock,
}));

void mock.module('valtio/react', () => ({
	useSnapshot: <T,>(value: T) => value,
}));

void mock.module('../onlineGame', () => ({
	getOnlineNetworking: () => ({
		state: { self: { name: '' } },
		rooms: {},
		leaveGameRoom: () => {},
		updateSelf: () => {},
	}),
	selectRoomDirectoryListings: () => [],
	sanitizePlayerName: (v: string) => v.trim() || null,
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

	test('preserves debug_id when joining a room via code input', () => {
		window.history.replaceState(null, '', '/?debug_id=tab-2');

		render(<LobbyDirectory />);

		fireEvent.change(screen.getByTestId('room-directory-join-input'), { target: { value: 'ABCD' } });

		expect(navigateMock).toHaveBeenCalledWith({
			to: '/',
			search: { room: 'ABCD', debug_id: 'tab-2' },
			hash: '',
		});
	});

	test('renders create room button', () => {
		render(<LobbyDirectory />);
		expect(screen.getByTestId('room-directory-create')).toBeInTheDocument();
	});
});
