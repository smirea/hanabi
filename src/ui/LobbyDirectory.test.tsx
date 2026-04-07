import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const navigateMock = mock(() => {});
const leaveRoomMock = mock(() => {});

void mock.module('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock,
}));

void mock.module('valtio/react', () => ({
	useSnapshot: <T,>(value: T) => value,
}));

void mock.module('../onlineGame', () => ({
	getOnlineNetworking: () => ({
		state: {},
		rooms: {},
		leaveGameRoom: leaveRoomMock,
	}),
	selectRoomDirectoryListings: () => [],
}));

import { LobbyDirectory } from './LobbyDirectory';

describe('LobbyDirectory', () => {
	beforeEach(() => {
		navigateMock.mockClear();
		leaveRoomMock.mockClear();
		window.history.replaceState(null, '', '/');
		window.location.hash = '';
	});

	afterEach(() => {
		cleanup();
	});

	test('preserves debug_id when joining a room', () => {
		window.history.replaceState(null, '', '/?debug_id=tab-2');

		render(<LobbyDirectory />);

		fireEvent.change(screen.getByTestId('room-directory-join-input'), { target: { value: 'abCd' } });
		fireEvent.click(screen.getByTestId('room-directory-join-button'));

		expect(navigateMock).toHaveBeenCalledWith({
			to: '/',
			search: { room: 'ABCD', debug_id: 'tab-2' },
			hash: '',
		});
	});
});
