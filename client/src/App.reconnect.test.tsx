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
import { HanabiGame, getFireworkCardNumbers, scoreHanabiState, type HanabiState } from './game';
import { storageKeys } from './utils/constants';
import { LS } from './utils/utils';

function createFinishedRoom({
	status = 'finished',
	fuseTokensUsed = 0,
	includeMulticolor = false,
	includeBlack = false,
	completeFireworks = false,
	rematchPlayerIds = [],
}: {
	status?: 'finished' | 'lost' | 'won';
	fuseTokensUsed?: number;
	includeMulticolor?: boolean;
	includeBlack?: boolean;
	completeFireworks?: boolean;
	rematchPlayerIds?: string[];
} = {}) {
	const game = new HanabiGame({
		playerIds: ['player:1', 'player:2'],
		playerNames: ['Alex', 'Blair'],
		includeMulticolor,
		includeBlack,
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
			{
				id: 'player:1',
				userId: 1,
				name: 'Alex',
				isTv: false,
				isReady: false,
				wantsRematch: rematchPlayerIds.includes('player:1'),
			},
			{
				id: 'player:2',
				userId: 2,
				name: 'Blair',
				isTv: false,
				isReady: false,
				wantsRematch: rematchPlayerIds.includes('player:2'),
			},
		],
		settings: {
			includeMulticolor,
			includeBlack,
			includeFlamboyants: false,
			multicolorShortDeck: includeMulticolor,
			multicolorWildHints: includeMulticolor,
			endlessMode: false,
		},
		gameState,
	};
}

function createPlayingRoom({
	drawDeckCount = 12,
	endlessMode = false,
}: {
	drawDeckCount?: number;
	endlessMode?: boolean;
} = {}) {
	const game = new HanabiGame({
		playerIds: ['player:1', 'player:2'],
		playerNames: ['Alex', 'Blair'],
		shuffleSeed: 1234,
		endlessMode,
	});
	const gameState = game.getSnapshot();
	gameState.drawDeck = gameState.drawDeck.slice(0, drawDeckCount);

	return {
		status: 'connected',
		selfId: '1',
		selfPlayerId: 'player:1',
		snapshotVersion: 4,
		phase: 'playing',
		members: [
			{
				id: 'player:1',
				userId: 1,
				name: 'Alex',
				isTv: false,
				isReady: false,
				wantsRematch: false,
			},
			{
				id: 'player:2',
				userId: 2,
				name: 'Blair',
				isTv: false,
				isReady: false,
				wantsRematch: false,
			},
		],
		settings: {
			includeMulticolor: false,
			includeBlack: false,
			includeFlamboyants: false,
			multicolorShortDeck: false,
			multicolorWildHints: false,
			endlessMode,
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

function expectIconOnlyBadge(testId: string, src: string): void {
	const badge = screen.getByTestId(testId);
	expect(badge.textContent).toBe('');

	const image = badge.querySelector('img');
	if (!image) {
		throw new Error(`Missing badge image in ${testId}`);
	}

	expect(image).toHaveAttribute('src', src);
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

	test('uses static deck warning colors when the deck is low', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createPlayingRoom({ drawDeckCount: 9 });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('deck-pill')).toHaveClass('deck-pill-warning');

		cleanup();
		mockRoom = createPlayingRoom({ drawDeckCount: 3, endlessMode: true });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('deck-pill')).toHaveClass('deck-pill-danger');
	});

	test('does not show a final round banner when the deck is empty', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createPlayingRoom({ drawDeckCount: 0 });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('deck-pill')).toHaveClass('deck-pill-danger');
		expect(screen.queryByTestId('last-round-banner')).not.toBeInTheDocument();
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

	test('endgame rematch button sends a vote and shows existing player votes', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ rematchPlayerIds: ['player:2'] });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-rematch-check-player:2')).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('endgame-new-game'));

		expect(sendActionMock).toHaveBeenCalledWith({
			type: 'set-rematch',
			actorId: 'player:1',
			rematch: true,
		});
	});

	test('endgame loss shows no lives remaining even for non-fuse defeats', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ status: 'lost', fuseTokensUsed: 0 });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-title')).toHaveTextContent('You lost');
		expect(screen.getByTestId('endgame-lives-remaining')).toHaveTextContent('Lives0/3');
	});

	test('endgame shows an icon-only score flavor badge and dismissible reveal', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ status: 'lost', fuseTokensUsed: 0 });

		render(<App roomCode='ABCD' />);

		expectIconOnlyBadge('endgame-score-flavor', '/score-badges/poo.png');
		expect(screen.getByTestId('endgame-score')).not.toHaveTextContent('=');
		expect(screen.getByTestId('endgame-hints-used')).toHaveTextContent('Hints used');
		expect(screen.getByTestId('endgame-rounds')).toHaveTextContent('Rounds');
		expect(screen.getByTestId('endgame-score-reveal-score')).toHaveTextContent('0');
		expect(screen.getByTestId('endgame-score-reveal')).toHaveTextContent('makes you a');
		expect(screen.getByTestId('endgame-score-reveal')).toHaveTextContent('Legendary loser');
		expectIconOnlyBadge('endgame-score-reveal-badge', '/score-badges/poo.png');

		fireEvent.click(screen.getByTestId('endgame-score-reveal'));

		expect(screen.getByTestId('endgame-score-reveal')).toHaveClass('exit');
	});

	test('endgame score flavor shows the crown icon for perfect base wins', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({ status: 'won', completeFireworks: true });

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-score')).toHaveTextContent('25');
		expectIconOnlyBadge('endgame-score-flavor', '/score-badges/crown.png');
		expectIconOnlyBadge('endgame-score-reveal-badge', '/score-badges/crown.png');
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
		expectIconOnlyBadge('endgame-score-flavor', '/score-badges/eyebrow.png');
		expectIconOnlyBadge('endgame-score-reveal-badge', '/score-badges/eyebrow.png');
	});

	test('endgame score flavor shows the supernova icon for perfect black multicolor wins', () => {
		LS.set({ [storageKeys.debugMode]: false });
		mockRoom = createFinishedRoom({
			status: 'won',
			includeMulticolor: true,
			includeBlack: true,
			completeFireworks: true,
		});

		render(<App roomCode='ABCD' />);

		expect(screen.getByTestId('endgame-score')).toHaveTextContent('35');
		expectIconOnlyBadge('endgame-score-flavor', '/score-badges/supernova.png');
		expectIconOnlyBadge('endgame-score-reveal-badge', '/score-badges/supernova.png');
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
		expect(screen.getByTestId('endgame-stats-table')).toHaveTextContent('given');
		expect(screen.getByTestId('endgame-hints-given-player:1')).toHaveTextContent('0');
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
