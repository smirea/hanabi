import { describe, expect, test } from 'bun:test';
import type { CardNumber, Suit } from '../../../game';
import { HanabiGame } from '../../../game';
import { resolveCardSelectionAction } from './useCardActionHandlers';

type TestCardSeed = { suit: Suit; number: CardNumber };

const TWO_PLAYER_MULTICOLOR_DECK: TestCardSeed[] = [
	{ suit: 'R', number: 1 },
	{ suit: 'M', number: 1 },
	{ suit: 'Y', number: 1 },
	{ suit: 'R', number: 2 },
	{ suit: 'G', number: 1 },
	{ suit: 'Y', number: 2 },
	{ suit: 'B', number: 1 },
	{ suit: 'G', number: 2 },
	{ suit: 'W', number: 1 },
	{ suit: 'B', number: 2 },
];

const TWO_PLAYER_BLACK_DECK: TestCardSeed[] = [
	{ suit: 'R', number: 1 },
	{ suit: 'K', number: 5 },
	{ suit: 'Y', number: 1 },
	{ suit: 'R', number: 2 },
	{ suit: 'G', number: 1 },
	{ suit: 'Y', number: 2 },
	{ suit: 'B', number: 1 },
	{ suit: 'G', number: 2 },
	{ suit: 'W', number: 1 },
	{ suit: 'B', number: 2 },
];

const TWO_PLAYER_SPECIAL_COMPLETION_DECK: TestCardSeed[] = [
	{ suit: 'K', number: 1 },
	{ suit: 'M', number: 5 },
	{ suit: 'Y', number: 1 },
	{ suit: 'R', number: 2 },
	{ suit: 'G', number: 1 },
	{ suit: 'Y', number: 2 },
	{ suit: 'B', number: 1 },
	{ suit: 'G', number: 2 },
	{ suit: 'W', number: 1 },
	{ suit: 'B', number: 2 },
];

function addFireworkCard(game: HanabiGame, suit: Suit, number: CardNumber): void {
	const id = `played-${suit}-${number}`;
	game.state.cards[id] = {
		id,
		suit,
		number,
		hints: {
			color: null,
			number: null,
			notColors: [],
			notNumbers: [],
			recentlyHinted: false,
		},
	};
	game.state.fireworks[suit].push(id);
}

describe('resolveCardSelectionAction', () => {
	test('plays immediately even when selected card is already known redundant', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2'],
			playerNames: ['A', 'B'],
			includeMulticolor: true,
			deck: TWO_PLAYER_MULTICOLOR_DECK,
		});

		const actorId = game.state.players[0]?.id;
		const cardId = game.state.players[0]?.cards[0];
		if (!actorId || !cardId) {
			throw new Error('Failed to prepare redundant play selection test');
		}

		const card = game.state.cards[cardId];
		card.hints.color = card.suit;
		card.hints.number = card.number;
		game.state.fireworks[card.suit] = Array.from({ length: card.number }, () => cardId);

		const resolved = resolveCardSelectionAction({
			state: game.state,
			actorId,
			pendingAction: 'play',
			playerId: actorId,
			cardId,
		});

		expect(resolved).toEqual({
			kind: 'action',
			action: {
				type: 'play',
				actorId,
				cardId,
			},
		});
	});

	test('opens completion bonus picker for playable black 1 and multicolor 5', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2'],
			playerNames: ['A', 'B'],
			includeBlack: true,
			includeMulticolor: true,
			includeFlamboyants: true,
			bonusTiles: ['gain-hint'],
			deck: TWO_PLAYER_SPECIAL_COMPLETION_DECK,
		});

		for (const number of [5, 4, 3, 2] as const) {
			addFireworkCard(game, 'K', number);
		}
		for (const number of [1, 2, 3, 4] as const) {
			addFireworkCard(game, 'M', number);
		}

		const actorId = game.state.players[0]?.id;
		const blackOneId = game.state.players[0]?.cards[0];
		const multicolorFiveId = game.state.players[1]?.cards[0];
		if (!actorId || !blackOneId || !multicolorFiveId) {
			throw new Error('Failed to prepare special completion selection test');
		}

		expect(
			resolveCardSelectionAction({
				state: game.state,
				actorId,
				pendingAction: 'play',
				playerId: actorId,
				cardId: blackOneId,
			}),
		).toEqual({ kind: 'completion-bonus-picker', cardId: blackOneId });

		game.state.currentTurnPlayerIndex = 1;
		expect(
			resolveCardSelectionAction({
				state: game.state,
				actorId: 'p2',
				pendingAction: 'play',
				playerId: 'p2',
				cardId: multicolorFiveId,
			}),
		).toEqual({ kind: 'completion-bonus-picker', cardId: multicolorFiveId });
	});

	test('plays special completion cards directly when they are not playable', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2'],
			playerNames: ['A', 'B'],
			includeBlack: true,
			includeMulticolor: true,
			includeFlamboyants: true,
			bonusTiles: ['gain-hint'],
			deck: TWO_PLAYER_SPECIAL_COMPLETION_DECK,
		});

		const actorId = game.state.players[0]?.id;
		const blackOneId = game.state.players[0]?.cards[0];
		if (!actorId || !blackOneId) {
			throw new Error('Failed to prepare nonplayable completion selection test');
		}

		expect(
			resolveCardSelectionAction({
				state: game.state,
				actorId,
				pendingAction: 'play',
				playerId: actorId,
				cardId: blackOneId,
			}),
		).toEqual({
			kind: 'action',
			action: {
				type: 'play',
				actorId,
				cardId: blackOneId,
			},
		});
	});

	test('opens base-suit picker when selecting a multicolor card for a color hint', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2'],
			playerNames: ['A', 'B'],
			includeMulticolor: true,
			multicolorWildHints: false,
			deck: TWO_PLAYER_MULTICOLOR_DECK,
		});

		const actorId = game.state.players[0]?.id;
		const target = game.state.players[1];
		const multicolorCardId = target?.cards.find(cardId => game.state.cards[cardId]?.suit === 'M');
		if (!actorId || !target || !multicolorCardId) {
			throw new Error('Failed to prepare multicolor color-hint selection test');
		}

		const resolved = resolveCardSelectionAction({
			state: game.state,
			actorId,
			pendingAction: 'hint-color',
			playerId: target.id,
			cardId: multicolorCardId,
		});

		expect(resolved).toEqual({ kind: 'wild-color-picker', targetPlayerId: target.id });
	});

	test('returns a direct color-hint action for non-multicolor cards', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2'],
			playerNames: ['A', 'B'],
			includeMulticolor: true,
			deck: TWO_PLAYER_MULTICOLOR_DECK,
		});

		const actorId = game.state.players[0]?.id;
		const target = game.state.players[1];
		const redCardId = target?.cards.find(cardId => game.state.cards[cardId]?.suit === 'R');
		if (!actorId || !target || !redCardId) {
			throw new Error('Failed to prepare non-multicolor color-hint selection test');
		}

		const resolved = resolveCardSelectionAction({
			state: game.state,
			actorId,
			pendingAction: 'hint-color',
			playerId: target.id,
			cardId: redCardId,
		});

		expect(resolved).toEqual({
			kind: 'action',
			action: {
				type: 'hint-color',
				actorId,
				targetPlayerId: target.id,
				suit: 'R',
			},
		});
	});

	test('reports invalid feedback when selecting a black card for a color hint', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2'],
			playerNames: ['A', 'B'],
			includeBlack: true,
			deck: TWO_PLAYER_BLACK_DECK,
		});

		const actorId = game.state.players[0]?.id;
		const target = game.state.players[1];
		const blackCardId = target?.cards.find(cardId => game.state.cards[cardId]?.suit === 'K');
		if (!actorId || !target || !blackCardId) {
			throw new Error('Failed to prepare black color-hint selection test');
		}

		const resolved = resolveCardSelectionAction({
			state: game.state,
			actorId,
			pendingAction: 'hint-color',
			playerId: target.id,
			cardId: blackCardId,
		});

		expect(resolved).toEqual({ kind: 'invalid-color-hint', cardId: blackCardId });
	});
});
