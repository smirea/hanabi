import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { storageKeys } from '../utils/constants';
import { LS } from '../utils/utils';

const navigateMock = mock(() => {});

void mock.module('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock,
}));

void mock.module('../hooks/useGameServer', () => ({
	useOnlineRoom: () => ({
		room: {
			status: 'connected',
			selfId: '1',
			selfPlayerId: 'player:1',
			snapshotVersion: 0,
			phase: 'lobby',
			members: [{ id: 'player:1', userId: 1, name: 'unnamed', isTv: false, isReady: false }],
			settings: {
				includeMulticolor: false,
				multicolorShortDeck: false,
				multicolorWildHints: false,
				endlessMode: false,
			},
			gameState: null,
		},
		user: { id: 1, name: 'unnamed' },
		error: null,
		joinRoom: async () => null,
		reloadRoom: async () => null,
		sendAction: async () => null,
	}),
}));

import { RoomScreen } from './RoomScreen';

describe('RoomScreen', () => {
	beforeEach(() => {
		navigateMock.mockClear();
		window.history.replaceState(null, '', '/');
		window.location.hash = '';
	});

	afterEach(() => {
		cleanup();
		LS.clearAll();
	});

	test('rejects legacy non-4-letter codes', () => {
		render(<RoomScreen code='alpha_7' />);

		expect(screen.getByTestId('room-invalid-root')).toBeInTheDocument();
		expect(screen.queryByTestId('lobby-root')).not.toBeInTheDocument();
		expect(navigateMock).not.toHaveBeenCalled();
	});

	test('normalizes valid 4-letter codes and canonicalizes URL search', async () => {
		render(<RoomScreen code='abCd' />);

		expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
		expect(screen.getByTestId('lobby-room-code')).toHaveTextContent('ABCD');

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: '/',
				search: { room: 'ABCD' },
				hash: '',
				replace: true,
			});
		});
	});

	test('canonicalizes with the initialized persistent search params', async () => {
		window.history.replaceState(null, '', '/room/abCd?DEBUG_ID=tab-2');

		render(<RoomScreen code='abCd' />);

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: '/',
				search: { room: 'ABCD' },
				hash: '',
				replace: true,
			});
		});
	});

	test('does not navigate when already on canonical room URL', async () => {
		window.history.replaceState(null, '', '/?room=ABCD');

		render(<RoomScreen code='ABCD' />);

		expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
		expect(screen.getByTestId('lobby-room-code')).toHaveTextContent('ABCD');
		await waitFor(() => {
			expect(navigateMock).not.toHaveBeenCalled();
		});
	});

	test('stores the active room and clears it when leaving', () => {
		render(<RoomScreen code='ABCD' />);

		expect(LS.get(storageKeys.currentRoom)).toBe('ABCD');

		fireEvent.click(screen.getByTestId('lobby-leave-room'));

		expect(LS.get(storageKeys.currentRoom)).toBeNull();
		expect(navigateMock).toHaveBeenCalledWith({
			to: '/',
			search: {},
			hash: '',
		});
	});
});
