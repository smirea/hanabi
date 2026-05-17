import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

void mock.module('./hooks/useGameServer', () => ({
	useOnlineRoom: () => ({
		room: {
			status: 'connected',
			selfId: '1',
			selfPlayerId: 'player:1',
			snapshotVersion: 1,
			phase: 'lobby',
			members: [
				{ id: 'player:1', userId: 1, name: 'Alex', isTv: false, isReady: false },
				{ id: 'player:2', userId: 2, name: 'Blair', isTv: false, isReady: false },
			],
			settings: {
				includeMulticolor: false,
				multicolorShortDeck: false,
				multicolorWildHints: false,
				endlessMode: false,
			},
			gameState: null,
		},
		user: { id: 1, name: 'Alex' },
		error: null,
		joinRoom: async () => null,
		reloadRoom: async () => null,
		sendAction: async () => null,
	}),
}));

import App from './App';
import { storageKeys } from './utils/constants';
import { LS } from './utils/utils';

const ROOM_CODE = 'ABCD';

function getHintCount(): number {
	const raw = screen.getByTestId('status-hints-count').textContent;
	if (!raw) {
		throw new Error('Missing hint count text');
	}

	return Number(raw);
}

function getFuseCount(): number {
	const raw = screen.getByTestId('status-fuses-count').textContent;
	if (!raw) {
		throw new Error('Missing fuse count text');
	}

	return Number(raw);
}

function getCardNumber(playerId: string, index: number): number | null {
	const text = screen.getByTestId(`card-${playerId}-${index}`).textContent ?? '';
	const value = Number(text.replace(/[^0-9]/g, '').slice(0, 1));
	if (!Number.isFinite(value) || value < 1 || value > 5) {
		return null;
	}

	return value;
}

function getCardColorToken(playerId: string, index: number): string {
	const card = screen.getByTestId(`card-${playerId}-${index}`);
	return (card as HTMLElement).style.getPropertyValue('--card-bg').trim();
}

function findHintTargetByNumber(playerIds: string[]): string {
	const target = playerIds.find(playerId => {
		const numbers = new Set<number>();
		for (let index = 0; index < 5; index += 1) {
			const number = getCardNumber(playerId, index);
			if (number !== null) numbers.add(number);
		}

		return numbers.size > 1;
	});

	if (!target) {
		throw new Error('Expected a target hand with at least two distinct card numbers');
	}

	return target;
}

function findHintTargetByColor(playerIds: string[]): string {
	const target = playerIds.find(playerId => {
		const colors = new Set<string>();
		for (let index = 0; index < 5; index += 1) {
			const color = getCardColorToken(playerId, index);
			if (color.length > 0) colors.add(color);
		}

		return colors.size > 1;
	});

	if (!target) {
		throw new Error('Expected a target hand with at least two distinct card colors');
	}

	return target;
}

function findTeammateCardIndexWithNumberOverOne(playerId: string): number {
	for (let index = 0; index < 5; index += 1) {
		const number = getCardNumber(playerId, index);
		if (number !== null && [2, 3, 4, 5].includes(number)) {
			return index;
		}
	}

	throw new Error(`Could not find a guaranteed misplay card for ${playerId}`);
}

afterEach(() => {
	cleanup();
	LS.clearAll();
	window.history.replaceState(null, '', '/');
});

describe('App local debug wiring', () => {
	beforeEach(() => {
		LS.set({ [storageKeys.debugMode]: true });
	});

	test('play action resolves on card tap and swaps perspective to the next player', () => {
		render(<App roomCode={ROOM_CODE} />);

		expect(screen.getByTestId('player-turn-p1')).toBeInTheDocument();
		expect(screen.getByTestId('card-p1-0')).toHaveTextContent('?');

		fireEvent.click(screen.getByTestId('actions-play'));
		fireEvent.click(screen.getByTestId('card-p1-0'));

		expect(screen.queryByTestId('player-turn-p1')).not.toBeInTheDocument();
		expect(screen.getByTestId('player-turn-p2')).toBeInTheDocument();
		expect(screen.getByTestId('card-p2-0')).toHaveTextContent('?');
		expect(screen.getByTestId('card-p1-0')).not.toHaveTextContent('?');
	});

	test('players are ordered by next turn from each viewer perspective', () => {
		render(<App roomCode={ROOM_CODE} />);

		const tableShell = screen.getByTestId('table-shell');
		const initialOrder = [...tableShell.querySelectorAll('article.player')].map(node =>
			node.getAttribute('data-testid'),
		);
		expect(initialOrder).toEqual(['player-p2', 'player-p3', 'player-p1']);

		fireEvent.click(screen.getByTestId('actions-play'));
		fireEvent.click(screen.getByTestId('card-p1-0'));

		const nextOrder = [...tableShell.querySelectorAll('article.player')].map(node =>
			node.getAttribute('data-testid'),
		);
		expect(nextOrder).toEqual(['player-p3', 'player-p1', 'player-p2']);
	});

	test('number hint resolves from tapped target card and consumes one hint token', () => {
		render(<App roomCode={ROOM_CODE} />);

		const startHints = getHintCount();

		fireEvent.click(screen.getByTestId('actions-number'));
		fireEvent.click(screen.getByTestId('card-p2-0'));

		expect(getHintCount()).toBe(startHints - 1);
		expect(screen.getByTestId('player-turn-p2')).toBeInTheDocument();
	});

	test('fuses start full and decrease after a misplay', () => {
		render(<App roomCode={ROOM_CODE} />);

		expect(getFuseCount()).toBe(3);

		const blairMisplayIndex = findTeammateCardIndexWithNumberOverOne('p2');

		fireEvent.click(screen.getByTestId('actions-number'));
		fireEvent.click(screen.getByTestId('card-p3-0'));

		fireEvent.click(screen.getByTestId('actions-play'));
		fireEvent.click(screen.getByTestId(`card-p2-${blairMisplayIndex}`));

		expect(getFuseCount()).toBe(2);
	});

	test('burger menu toggles debug mode persisted in local storage', () => {
		render(<App roomCode={ROOM_CODE} />);

		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-local-debug-value')).toHaveTextContent('On');

		fireEvent.click(screen.getByTestId('menu-local-debug-toggle'));
		expect(LS.get(storageKeys.debugMode)).toBe(false);
		expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
		expect(screen.queryByTestId('actions-play')).not.toBeInTheDocument();
	});

	test('negative hint toggles default to on and persist in local storage', () => {
		render(<App roomCode={ROOM_CODE} />);

		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-negative-color-value')).toHaveTextContent('On');
		expect(screen.getByTestId('menu-negative-number-value')).toHaveTextContent('On');

		fireEvent.click(screen.getByTestId('menu-negative-color-toggle'));
		expect(LS.get(storageKeys.negativeColorHints)).toBe(false);
		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-negative-color-value')).toHaveTextContent('Off');

		fireEvent.click(screen.getByTestId('menu-negative-number-toggle'));
		expect(LS.get(storageKeys.negativeNumberHints)).toBe(false);
		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-negative-number-value')).toHaveTextContent('Off');
	});

	test('negative hint toggles hide badges when turned off', () => {
		render(<App roomCode={ROOM_CODE} />);

		const colorTargetPlayer = findHintTargetByColor(['p2', 'p3']);
		fireEvent.click(screen.getByTestId('actions-color'));
		fireEvent.click(screen.getByTestId(`card-${colorTargetPlayer}-0`));
		expect(document.querySelectorAll('.badge.not-color').length).toBeGreaterThan(0);

		fireEvent.click(screen.getByTestId('actions-menu'));
		fireEvent.click(screen.getByTestId('menu-negative-color-toggle'));
		expect(document.querySelectorAll('.badge.not-color').length).toBe(0);

		const numberTargetPlayer = findHintTargetByNumber(['p2', 'p3']);
		fireEvent.click(screen.getByTestId('actions-number'));
		fireEvent.click(screen.getByTestId(`card-${numberTargetPlayer}-0`));
		expect(document.querySelectorAll('.badge.not-number').length).toBeGreaterThan(0);

		fireEvent.click(screen.getByTestId('actions-menu'));
		fireEvent.click(screen.getByTestId('menu-negative-number-toggle'));
		expect(document.querySelectorAll('.badge.not-number').length).toBe(0);
	});

	test('turn sound toggle defaults on and persists from burger menu', () => {
		render(<App roomCode={ROOM_CODE} />);

		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-turn-sound-value')).toHaveTextContent('On');

		fireEvent.click(screen.getByTestId('menu-turn-sound-toggle'));
		expect(LS.get(storageKeys.turnSoundEnabled)).toBe(false);

		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-turn-sound-value')).toHaveTextContent('Off');
	});

	test('tibi mode toggle defaults off and persists from burger menu', () => {
		render(<App roomCode={ROOM_CODE} />);

		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-tibi-mode-value')).toHaveTextContent('Off');

		fireEvent.click(screen.getByTestId('menu-tibi-mode-toggle'));
		expect(LS.get(storageKeys.tibiMode)).toBe(true);

		fireEvent.click(screen.getByTestId('actions-menu'));
		expect(screen.getByTestId('menu-tibi-mode-value')).toHaveTextContent('On');
	});

	test('dark mode toggle persists from burger menu and updates the document theme', async () => {
		render(<App roomCode={ROOM_CODE} />);

		await waitFor(() => {
			expect(document.documentElement.dataset.theme).toBe('light');
		});

		fireEvent.click(screen.getByTestId('actions-menu'));
		fireEvent.click(screen.getByTestId('menu-dark-mode-toggle'));

		expect(LS.get(storageKeys.darkMode)).toBe(true);
		await waitFor(() => {
			expect(document.documentElement.dataset.theme).toBe('dark');
		});
	});

	test('non-debug mode renders the staging lobby flow', () => {
		LS.set({ [storageKeys.debugMode]: false });
		render(<App roomCode={ROOM_CODE} />);

		expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
		expect(screen.getByTestId('lobby-start')).toHaveTextContent('Ready Up');
	});

	test('dark mode toggle is available on the lobby landing screen', async () => {
		LS.set({ [storageKeys.debugMode]: false });
		render(<App roomCode={ROOM_CODE} />);

		await waitFor(() => {
			expect(document.documentElement.dataset.theme).toBe('light');
		});

		fireEvent.click(screen.getByTestId('lobby-theme-toggle'));

		expect(LS.get(storageKeys.darkMode)).toBe(true);
		await waitFor(() => {
			expect(document.documentElement.dataset.theme).toBe('dark');
		});
	});

	test('staging lobby room code is visible', () => {
		LS.set({ [storageKeys.debugMode]: false });
		render(<App roomCode={ROOM_CODE} />);

		expect(screen.getByTestId('lobby-room-code')).toHaveTextContent(ROOM_CODE);
	});

	test('staging lobby room follows the explicit room code prop', () => {
		LS.set({ [storageKeys.debugMode]: false });
		window.history.replaceState(null, '', '/?room=alpha_7');
		render(<App roomCode={ROOM_CODE} />);

		expect(screen.getByTestId('lobby-room-code')).toHaveTextContent(ROOM_CODE);
		expect(screen.queryByTestId('lobby-room-input')).not.toBeInTheDocument();
		expect(window.location.search).toBe('?room=alpha_7');
	});
});

describe('App initialized storage namespace', () => {
	test('uses the storage namespace initialized at module load', () => {
		window.history.replaceState(null, '', '/?debug_id=tab-2');
		LS.set({ [storageKeys.debugMode]: false });

		render(<App roomCode={ROOM_CODE} />);

		expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
		expect(screen.getByTestId('lobby-room-code')).toHaveTextContent(ROOM_CODE);
	});
});

describe('App room-code validation', () => {
	test('rejects non-4-letter room codes', () => {
		expect(() => render(<App roomCode='alpha_7' />)).toThrow('Room codes must be 4 letters.');
	});
});
