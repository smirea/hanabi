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

describe('resolveCardSelectionAction', () => {
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
			redundantPlayConfirmCardId: null,
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
			redundantPlayConfirmCardId: null,
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
});
