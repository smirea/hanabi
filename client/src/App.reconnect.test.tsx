import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const sendActionMock = mock(async () => null);
let mockRoom: unknown = null;

void mock.module('./hooks/useGameServer', () => ({
	useAppVersion: () => ({ versionText: 'version 05 31, 2026 @ 12:34' }),
	useOnlineRoom: () => ({
		room: mockRoom,
		user: { id: 1, name: 'Alex' },
		error: null,
		wasKicked: false,
		joinRoom: async () => null,
		reloadRoom: async () => null,
		sendAction: sendActionMock,
	}),
}));

import App from './App';
import {
	HanabiGame,
	getFireworkCardNumbers,
	scoreHanabiState,
	type HanabiState,
} from './game';
import { storageKeys } from './utils/constants';
import { LS } from './utils/utils';

function createFinishedRoom({
	status = 'finished',
	fuseTokensUsed = 0,
	includeMulticolor = false,
	completeFireworks = false,
}: {
	status?: 'finished' | 'lost' | 'won';
	fuseTokensUsed?: number;
	includeMulticolor?: boolean;
	completeFireworks?: boolean;
} = {}) {
	const game = new HanabiGame({
		playerIds: ['player:1', 'player:2'],
		playerNames: ['Alex', 'Blair'],
		includeMulticolor,
		shuffleSeed: 1234,
	});
	const gameState = game.getSnapshot();
	if (completeFireworks) {
		completeActiveFireworks(gameState);
	}
	const viewerCardId = gameState.players[0]?.cards[0];
	if (viewerCardId) {
		const viewerCard = gameState.cards[viewerCardId];
		viewerCard.hints.number = viewerCard.number === 5 ? 4 : 5;
		viewerCard.hints.notColors = ['R', 'B'];
	}

	gameState.status = status;
	gameState.fuseTokensUsed = fuseTokensUsed;
	gameState.logs.push({
		id: `status-${status}`,
		turn: gameState.turn,
		type: 'status',
		status,
		reason: status === 'lost' ? 'indispensable_card_discarded' : 'final_round_complete',
		score: scoreHanabiState(gameState),
	});

	return {
		status: 'connected',
		selfId: '1',
		selfPlayerId: 'player:1',
		snapshotVersion: 4,
		phase: 'playing',
		members: [
			{ id: 'player:1', userId: 1, name: 'Alex', isTv: false, isReady: false },
			{ id: 'player:2', userId: 2, name: 'Blair', isTv: false, isReady: false },
		],
		settings: {
			includeMulticolor,
			multicolorShortDeck: includeMulticolor,
			multicolorWildHints: includeMulticolor,
			endlessMode: false,
		},
		gameState,
	};
}

function completeActiveFireworks(gameState: HanabiState): void {
	const usedCardIds = new Set<string>();

	for (const suit of gameState.settings.activeSuits) {
		for (const number of getFireworkCardNumbers(suit)) {
			const cardId = Object.values(gameState.cards).find(card => {
				return card.suit === suit && card.number === number && !usedCardIds.has(card.id);
			})?.id;

			if (!cardId) {
				throw new Error(`Missing ${suit}${number}`);
			}

			usedCardIds.add(cardId);
			gameState.fireworks[suit].push(cardId);
		}
	}
}

describe('App online reconnect state', () => {
	beforeEach(() => {
		mockRoom = null;
		sendActionMock.mockClear();
	});

	afterEach(() => {
		cleanup();
		LS.clearAll();
	});

	test('does not show the lobby controls while rejoining a room', () => {
		LS.set({ [storageKeys.debugMode]: false });

		render(<App roomCode='ABCD' />);

		expect(screen.getByText('Waiting for room snapshot in room ABCD.')).toBeInTheDocument();
		expect(screen.queryByTestId('lobby-start')).not.toBeInTheDocument();
	});

	test('endgame back to game only dismisses the local overlay', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom();

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-screen')).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('endgame-back-game'));

		expect(screen.queryByTestId('endgame-screen')).not.toBeInTheDocument();
		expect(screen.getByTestId('table-shell')).toBeInTheDocument();
		expect(sendActionMock).not.toHaveBeenCalled();
	});

	test('endgame loss shows no lives remaining even for non-fuse defeats', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ status: 'lost', fuseTokensUsed: 0 });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-title')).toHaveTextContent('You lost');
		expect(screen.getByTestId('endgame-lives-remaining')).toHaveTextContent('Lives0/3');
	});

	test('endgame shows the score flavor badge and dismissible reveal', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ status: 'lost', fuseTokensUsed: 0 });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-score-flavor')).toHaveTextContent('Horrible loser');
		expect(screen.getByTestId('endgame-score-reveal-score')).toHaveTextContent('0');
		expect(screen.getByTestId('endgame-score-reveal-badge')).toHaveTextContent(
			'Horrible loser',
		);

		fireEvent.click(screen.getByTestId('endgame-score-reveal'));

		expect(screen.getByTestId('endgame-score-reveal')).toHaveClass('exit');
	});

	test('endgame score flavor labels perfect wins as legendary winners', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ status: 'won', completeFireworks: true });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-score')).toHaveTextContent('25');
		expect(screen.getByTestId('endgame-score-flavor')).toHaveTextContent('Legendary winner');
		expect(screen.getByTestId('endgame-score-reveal-badge')).toHaveTextContent(
			'Legendary winner',
		);
	});

	test('endgame score flavor extends when variants raise the max score', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({
			status: 'won',
			includeMulticolor: true,
			completeFireworks: true,
		});

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-score')).toHaveTextContent('30');
		expect(screen.getByTestId('endgame-score-flavor')).toHaveTextContent('Celestial winner');
		expect(screen.getByTestId('endgame-score-reveal-badge')).toHaveTextContent(
			'Celestial winner',
		);
	});

	test('endgame summary reveals final hands with viewer hand hints', () => {
		LS.set({ [storageKeys.debugMode]: false });
		const room = createFinishedRoom();
		room.gameState.players[1].cards = room.gameState.players[1].cards.slice(0, 4);
		mockRoom = room;

		render(<App roomCode='ABCD' />);

		const firstCardId = room.gameState.players[0].cards[0];
		const firstCard = room.gameState.cards[firstCardId];
		const finalCard = screen.getByTestId('endgame-final-card-player:1-0');
		const summaryChildren = Array.from(screen.getByTestId('endgame-summary').children);

		expect(summaryChildren).toEqual([
			screen.getByTestId('endgame-stats'),
			screen.getByTestId('endgame-final-hands'),
		]);
		expect(screen.getByTestId('endgame-final-hands')).toBeInTheDocument();
		expect(
			screen.getByTestId('endgame-final-hand-cards-player:1').style.getPropertyValue('--hand-size'),
		).toBe('5');
		expect(
			screen.getByTestId('endgame-final-hand-cards-player:2').style.getPropertyValue('--hand-size'),
		).toBe('5');
		expect(finalCard.querySelector('.card-face-value')).toHaveTextContent(String(firstCard.number));
		expect(finalCard.querySelector('.badge.number')).toHaveTextContent(
			String(firstCard.hints.number),
		);
		expect(finalCard.querySelectorAll('.badge.not-color')).toHaveLength(2);
	});

	test('endgame uses compact fireworks when all six suits are active', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ includeMulticolor: true });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-fireworks-grid')).toHaveClass('compact');
	});
});
