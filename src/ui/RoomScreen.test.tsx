import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const navigateMock = mock(() => {});

void mock.module('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock,
}));

void mock.module('trystero/mqtt', () => ({
	selfId: 'peer-test',
	joinRoom: () => ({
		onPeerJoin: () => {},
		onPeerLeave: () => {},
		makeAction: () => [async () => {}, () => {}, () => {}] as const,
		getPeers: () => ({}),
		ping: async () => 1,
		leave: async () => {},
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

	test('preserves debug_id when canonicalizing URL search', async () => {
		window.history.replaceState(null, '', '/room/abCd?debug_id=tab-2');

		render(<RoomScreen code='abCd' />);

		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: '/',
				search: { room: 'ABCD', debug_id: 'tab-2' },
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
});
