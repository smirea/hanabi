import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { AdminDebugSummary } from '../adminDebugApi';
import { ADMIN_DEBUG_EVENT } from '../debugServer';
import { AdminDebugScreen } from './AdminDebugScreen';

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;

const summary: AdminDebugSummary = {
	rooms: [{ code: 'ABCD', phase: 'lobby', players: ['Alex', 'Blair'] }],
	users: [{ id: 'user:1', userId: 1, name: 'Alex', gamesPlayed: 3 }],
	games: [
		{
			id: 'ABCD:10:42',
			startActionId: 10,
			endActionId: 42,
			roomCode: 'ABCD',
			score: 25,
			status: 'won',
			endedAt: '2026-05-31T20:12:00.000Z',
			players: ['Alex', 'Blair'],
			playerStats: [
				{
					id: 'player:1',
					name: 'Alex',
					hintsGiven: 1,
					hintsReceived: 2,
					plays: 3,
					discards: 4,
				},
				{
					id: 'player:2',
					name: 'Blair',
					hintsGiven: 2,
					hintsReceived: 1,
					plays: 4,
					discards: 3,
				},
			],
			settings: {
				includeMulticolor: false,
				multicolorShortDeck: false,
				multicolorWildHints: false,
				includeBlack: false,
				includeFlamboyants: false,
				endlessMode: false,
			},
			turns: 42,
			livesRemaining: 2,
			hintsRemaining: 4,
			maxLives: 3,
			maxHints: 8,
		},
	],
};

afterEach(() => {
	cleanup();
	globalThis.fetch = originalFetch;
	window.confirm = originalConfirm;
});

describe('AdminDebugScreen', () => {
	test('opens from DEBUG event and posts delete actions', async () => {
		const requests: Array<{ body: unknown; method: string; url: string }> = [];
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
			requests.push({ url, method: init?.method ?? 'GET', body });
			return Response.json(url.endsWith('/summary') ? summary : { ok: true });
		}) as unknown as typeof fetch;
		window.confirm = mock(() => true) as unknown as typeof window.confirm;

		render(<AdminDebugScreen />);
		await act(async () => {
			window.dispatchEvent(new Event(ADMIN_DEBUG_EVENT));
			await Promise.resolve();
		});

		expect(await screen.findByTestId('admin-debug-root')).toBeInTheDocument();
		expect(screen.getByText('ABCD')).toBeInTheDocument();
		expect(screen.getByText('Alex')).toBeInTheDocument();
		expect(screen.getByText('3 games')).toBeInTheDocument();
		expect(screen.getByText('ABCD · 25 pts')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('admin-debug-delete-room-ABCD'));
		await waitFor(() =>
			expect(requests).toContainEqual({
				url: '/api/admin/delete-room',
				method: 'POST',
				body: { roomCode: 'ABCD' },
			}),
		);
		await waitFor(() =>
			expect(screen.getByTestId('admin-debug-delete-user-user:1')).not.toBeDisabled(),
		);

		fireEvent.click(screen.getByTestId('admin-debug-delete-user-user:1'));
		await waitFor(() =>
			expect(requests).toContainEqual({
				url: '/api/admin/delete-user',
				method: 'POST',
				body: { userId: 1, name: null },
			}),
		);
		await waitFor(() =>
			expect(screen.getByTestId('admin-debug-delete-game-ABCD:10:42')).not.toBeDisabled(),
		);

		fireEvent.click(screen.getByTestId('admin-debug-delete-game-ABCD:10:42'));
		await waitFor(() =>
			expect(requests).toContainEqual({
				url: '/api/admin/delete-game',
				method: 'POST',
				body: { gameId: 'ABCD:10:42' },
			}),
		);
	});
});
