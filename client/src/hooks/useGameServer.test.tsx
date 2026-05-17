import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { useCurrentRoomResume } from './useGameServer';
import { storageKeys } from '../utils/constants';
import { LS } from '../utils/utils';

const originalFetch = globalThis.fetch;

function ResumeHarness() {
	const resume = useCurrentRoomResume();
	return (
		<div>
			<span data-testid='resume-loading'>{String(resume.isLoading)}</span>
			<span data-testid='resume-room'>{resume.roomCode ?? 'none'}</span>
		</div>
	);
}

afterEach(() => {
	cleanup();
	LS.clearAll();
	window.history.replaceState(null, '', '/');
	globalThis.fetch = originalFetch;
});

describe('useCurrentRoomResume', () => {
	test('loads the server room for the stored user when no room is in the URL', async () => {
		LS.set({
			[storageKeys.serverUserId]: 7,
			[storageKeys.serverClientKey]: 'client-7',
		});
		const fetchMock = mock(async () =>
			Response.json({
				roomCode: 'ABCD',
			}),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		render(<ResumeHarness />);

		await waitFor(() => {
			expect(screen.getByTestId('resume-loading')).toHaveTextContent('false');
		});
		expect(screen.getByTestId('resume-room')).toHaveTextContent('ABCD');
		expect(fetchMock).toHaveBeenCalledWith('/api/users/current-room?userId=7&clientKey=client-7', {
			headers: { Accept: 'application/json' },
		});
	});

	test('does not call the server without a stored user or client key', async () => {
		const fetchMock = mock(async () => Response.json({ roomCode: 'ABCD' }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		render(<ResumeHarness />);

		await waitFor(() => {
			expect(screen.getByTestId('resume-loading')).toHaveTextContent('false');
		});
		expect(screen.getByTestId('resume-room')).toHaveTextContent('none');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
