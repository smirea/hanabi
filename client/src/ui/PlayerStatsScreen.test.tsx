import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { GameHistoryEntry } from '../utils/types';
import { storageKeys } from '../utils/constants';
import { LS } from '../utils/utils';

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

import { PlayerStatsScreen } from './PlayerStatsScreen';

function historyEntry(entry: Partial<GameHistoryEntry> = {}): GameHistoryEntry {
	return {
		roomCode: 'ABCD',
		score: 20,
		status: 'won',
		endedAt: '2026-05-31T20:12:00.000Z',
		players: ['Alex', 'Blair'],
		playerStats: [
			{ id: 'player:1', name: 'Alex', hintsGiven: 2, hintsReceived: 1, plays: 5, discards: 3 },
			{ id: 'player:2', name: 'Blair', hintsGiven: 1, hintsReceived: 2, plays: 4, discards: 4 },
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
		...entry,
	};
}

describe('PlayerStatsScreen', () => {
	beforeEach(() => {
		mockHistory = [];
		navigateMock.mockClear();
		window.history.replaceState(null, '', '/stats');
	});

	afterEach(() => {
		cleanup();
		LS.clearAll();
	});

	test('orders the current player first and opens player detail routes', () => {
		LS.set({ [storageKeys.serverUserId]: 2 });
		mockHistory = [
			historyEntry({ score: 10 }),
			historyEntry({ roomCode: 'WXYZ', score: 25, endedAt: '2026-05-30T20:12:00.000Z' }),
		];

		render(<PlayerStatsScreen />);

		const rows = Array.from(
			screen.getByTestId('player-stats-table').querySelectorAll('.player-stats-row:not(.header)'),
		);
		expect(rows[0]).toHaveTextContent('Blair');
		expect(rows[0]).toHaveTextContent('you');
		expect(rows[0]).toHaveTextContent('2');

		fireEvent.click(screen.getByTestId('player-stats-row-player:2'));
		expect(navigateMock).toHaveBeenCalledWith({
			to: '/stats/$playerId',
			params: { playerId: 'player:2' },
			search: {},
			hash: '',
		});
	});

	test('shows summary stat tooltips and best score badges', () => {
		mockHistory = [
			historyEntry({
				score: 25,
				players: ['Alex'],
				playerStats: [
					{ id: 'player:1', name: 'Alex', hintsGiven: 2, hintsReceived: 1, plays: 5, discards: 3 },
				],
			}),
			historyEntry({
				roomCode: 'WXYZ',
				score: 10,
				players: ['Blair'],
				endedAt: '2026-05-30T20:12:00.000Z',
				playerStats: [
					{ id: 'player:2', name: 'Blair', hintsGiven: 1, hintsReceived: 2, plays: 4, discards: 4 },
				],
			}),
		];

		render(<PlayerStatsScreen />);

		expect(screen.getByTestId('player-stats-table')).toHaveTextContent('best');
		expect(screen.getByTestId('player-stats-summary-games-player:1')).not.toHaveAttribute(
			'data-tooltip',
		);
		expect(screen.getByTestId('player-stats-summary-avg-player:1')).toHaveAttribute(
			'data-tooltip',
			'best',
		);
		expect(screen.getByTestId('player-stats-summary-best-player:1')).toHaveAttribute(
			'data-tooltip',
			'best',
		);
		expect(screen.getByTestId('player-stats-summary-best-player:1')).toHaveTextContent('25');
		expect(
			screen.getByTestId('player-stats-table').querySelector('.player-stats-summary-icon'),
		).toBeNull();
		expect(
			screen
				.getByTestId('player-stats-summary-avg-player:2-comparison')
				.querySelector('.player-stats-poop-icon'),
		).not.toBeNull();
		expect(
			screen
				.getByTestId('player-stats-row-player:1')
				.querySelector('.player-stats-summary-badge img'),
		).not.toBeNull();
	});

	test('shows player title, compact metric columns, and per-cell comparisons', () => {
		mockHistory = [
			historyEntry({
				score: 10,
				playerStats: [
					{ id: 'player:1', name: 'Alex', hintsGiven: 2, hintsReceived: 1, plays: 5, discards: 3 },
					{ id: 'player:2', name: 'Blair', hintsGiven: 1, hintsReceived: 2, plays: 4, discards: 4 },
				],
			}),
			historyEntry({
				roomCode: 'WXYZ',
				score: 20,
				endedAt: '2026-05-30T20:12:00.000Z',
				playerStats: [
					{ id: 'player:1', name: 'Alex', hintsGiven: 4, hintsReceived: 3, plays: 7, discards: 1 },
					{ id: 'player:2', name: 'Blair', hintsGiven: 3, hintsReceived: 4, plays: 3, discards: 5 },
				],
			}),
		];

		render(<PlayerStatsScreen playerId='player:1' />);

		expect(screen.getByRole('heading', { name: "Alex's stats" })).toBeInTheDocument();
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('avg');
		expect(screen.getByTestId('player-stats-metric-table')).not.toHaveTextContent('avg/game');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('best');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('worst');
		expect(screen.getByTestId('player-stats-metric-table')).not.toHaveTextContent('global');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('score');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('15');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('hints given');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('hints received');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('cards played');
		expect(screen.getByTestId('player-stats-metric-table')).not.toHaveTextContent('rounds');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('6');
		expect(screen.getByTestId('player-stats-metric-table')).toHaveTextContent('3');
		expect(
			screen.getByTestId('player-stats-comparison-score-total').parentElement,
		).not.toHaveAttribute('data-tooltip');
		expect(screen.getByTestId('player-stats-comparison-given-total')).toHaveClass('best');
		expect(screen.getByTestId('player-stats-comparison-given-total')).toHaveAccessibleName('best');
		expect(screen.getByTestId('player-stats-recent')).toContainElement(
			screen.getByAltText('Shovel specialist'),
		);
		expect(screen.getByTestId('player-stats-recent')).toHaveTextContent('Win · Blair');
		expect(screen.getByTestId('player-stats-recent')).toHaveTextContent('May 31');
		expect(screen.getByTestId('player-stats-recent')).not.toHaveTextContent('8:12');
		expect(screen.getByTestId('player-stats-recent')).not.toHaveTextContent('4:12');
		expect(screen.getAllByLabelText('turns: 42').length).toBeGreaterThan(0);
		expect(screen.getAllByLabelText('hints given: 2').length).toBeGreaterThan(0);
	});
});
