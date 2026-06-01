import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { GameHistoryEntry } from '../utils/types';

const navigateMock = mock(() => {});
let mockHistory: GameHistoryEntry[] = [];

void mock.module('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock,
}));

void mock.module('../hooks/useGameServer', () => ({
	useGameHistory: () => ({
		history: mockHistory,
		reloadHistory: async () => {},
	}),
}));

import { HistoryScreen } from './HistoryScreen';

function historyEntry(entry: Partial<GameHistoryEntry> = {}): GameHistoryEntry {
	return {
		roomCode: 'ABCD',
		score: 25,
		status: 'won',
		endedAt: '2026-05-31T20:12:00.000Z',
		players: ['Alex', 'Blair'],
		settings: {
			includeMulticolor: false,
			multicolorShortDeck: false,
			multicolorWildHints: false,
			includeBlack: false,
			includeFlamboyants: false,
			endlessMode: false,
		},
		turns: 42,
		...entry,
	};
}

describe('HistoryScreen', () => {
	beforeEach(() => {
		mockHistory = [];
		navigateMock.mockClear();
		window.history.replaceState(null, '', '/history');
	});

	afterEach(() => {
		cleanup();
	});

	test('groups games by day and keeps the result badge at the row end', () => {
		mockHistory = [
			historyEntry({
				roomCode: 'ABCD',
				score: 30,
				endedAt: '2026-05-31T20:12:00.000Z',
				settings: {
					includeMulticolor: true,
					multicolorShortDeck: true,
					multicolorWildHints: true,
					includeBlack: false,
					includeFlamboyants: false,
					endlessMode: false,
				},
				turns: 57,
			}),
			historyEntry({
				roomCode: 'WXYZ',
				score: 17,
				endedAt: '2026-05-31T18:00:00.000Z',
			}),
			historyEntry({
				roomCode: 'ROOM',
				score: 5,
				endedAt: '2026-05-30T16:00:00.000Z',
			}),
		];

		render(<HistoryScreen />);

		expect(screen.getAllByTestId('history-day')).toHaveLength(2);
		expect(screen.queryByText('ABCD')).not.toBeInTheDocument();
		expect(screen.queryByText('WXYZ')).not.toBeInTheDocument();
		expect(screen.queryByText('ROOM')).not.toBeInTheDocument();

		const firstRow = screen.getAllByTestId('history-row')[0];
		expect(firstRow).toHaveTextContent('Alex, Blair');
		expect(firstRow).toHaveTextContent('Multicolor');
		expect(firstRow).toHaveTextContent('57 turns');
		expect(firstRow).toHaveStyle({ '--history-accent': '#7c3aed' });

		const result = within(firstRow).getByTestId('history-result');
		expect(result.firstElementChild).toHaveClass('history-turns');
		expect(result.lastElementChild).toHaveClass('history-badge');
		expect(within(result).getByTestId('history-badge-image')).toHaveAttribute(
			'src',
			'/score-badges/eyebrow.png',
		);
	});
});
