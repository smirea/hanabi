import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { getPendingCreatedRoomCode } from '../lobbySettingsStorage';
import { LS } from '../utils/utils';

const navigateMock = mock(() => {});
let roomDirectory: Array<{ code: string; players: string[]; phase: 'lobby' | 'playing' }> = [];

void mock.module('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock,
}));

void mock.module('../hooks/useGameServer', () => ({
	useAppVersion: () => ({ versionText: 'version 05 31, 2026 @ 12:34' }),
	useRoomDirectory: () => ({ rooms: roomDirectory, reloadDirectory: async () => {} }),
}));

import { LobbyDirectory } from './LobbyDirectory';

describe('LobbyDirectory', () => {
	beforeEach(() => {
		navigateMock.mockClear();
		roomDirectory = [];
		window.history.replaceState(null, '', '/');
		window.location.hash = '';
	});

	afterEach(() => {
		cleanup();
		LS.clearAll();
	});

	test('joins a room with initialized persistent search params', () => {
		window.history.replaceState(null, '', '/?DEBUG_ID=tab-2');

		render(<LobbyDirectory />);

		fireEvent.change(screen.getByTestId('room-directory-join-input'), {
			target: { value: 'ABCD' },
		});
		fireEvent.click(screen.getByTestId('room-directory-join'));

		expect(navigateMock).toHaveBeenCalledWith({
			to: '/',
			search: { room: 'ABCD' },
			hash: '',
		});
	});

	test('does not join while typing a complete room code', () => {
		render(<LobbyDirectory />);

		fireEvent.change(screen.getByTestId('room-directory-join-input'), {
			target: { value: 'ABCD' },
		});

		expect(navigateMock).not.toHaveBeenCalled();
		expect(screen.getByTestId('room-directory-join')).toBeEnabled();
	});

	test('renders create room button', () => {
		render(<LobbyDirectory />);
		expect(screen.getByTestId('room-directory-create')).toBeInTheDocument();
	});

	test('marks newly created rooms for settings restore', () => {
		render(<LobbyDirectory />);

		fireEvent.click(screen.getByTestId('room-directory-create'));

		const calls = navigateMock.mock.calls as unknown as Array<[{ search?: { room?: string } }]>;
		const navigateArg = calls[0]?.[0];
		const roomCode = navigateArg?.search?.room ?? null;
		expect(roomCode).toMatch(/^[A-Z]{4}$/);
		expect(getPendingCreatedRoomCode()).toBe(roomCode);
	});

	test('renders the faint server version under the title', () => {
		render(<LobbyDirectory />);
		expect(screen.getByTestId('room-directory-version')).toHaveTextContent(
			'version 05 31, 2026 @ 12:34',
		);
	});

	test('renders a resumable room banner with leave and join actions', () => {
		const leaveMock = mock(() => {});
		roomDirectory = [{ code: 'ABCD', players: ['Alex', 'Blair'], phase: 'lobby' }];

		render(<LobbyDirectory resumeRoomCode='ABCD' onLeaveResumeRoom={leaveMock} />);

		expect(screen.getByTestId('room-resume-banner')).toHaveTextContent('room ABCD');
		expect(screen.getByTestId('room-resume-banner')).toHaveTextContent('Alex, Blair');

		fireEvent.click(screen.getByTestId('room-resume-join'));
		expect(navigateMock).toHaveBeenCalledWith({
			to: '/',
			search: { room: 'ABCD' },
			hash: '',
		});

		fireEvent.click(screen.getByTestId('room-resume-leave'));
		expect(leaveMock).toHaveBeenCalledWith('ABCD');
	});
});
