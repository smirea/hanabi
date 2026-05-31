import { describe, expect, test } from 'bun:test';
import { HanabiGame } from '../../../game';
import { isRedundantHint } from './hintLogic';

describe('hintLogic', () => {
	test('marks number hints redundant after the same information is already applied', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2', 'p3'],
			playerNames: ['A', 'B', 'C'],
			shuffleSeed: 13,
		});

		const targetPlayerId = game.state.players[1]?.id;
		const hintedCardId = game.state.players[1]?.cards[0];
		if (!targetPlayerId || !hintedCardId) {
			throw new Error('Missing target player/card for hint redundancy test');
		}

		const hintedNumber = game.state.cards[hintedCardId]?.number;
		if (!hintedNumber) {
			throw new Error('Missing hinted card number');
		}

		const before = isRedundantHint(game.state, targetPlayerId, {
			hintType: 'number',
			number: hintedNumber,
		});
		expect(before.redundant).toBeFalse();

		game.giveNumberHint(targetPlayerId, hintedNumber);

		const after = isRedundantHint(game.state, targetPlayerId, {
			hintType: 'number',
			number: hintedNumber,
		});
		expect(after.redundant).toBeTrue();
	});

	test('treats known multicolor as redundant for later base-color hints', () => {
		const game = new HanabiGame({
			playerIds: ['p1', 'p2'],
			playerNames: ['A', 'B'],
			includeMulticolor: true,
			shuffleSeed: 17,
		});

		const target = game.state.players[1];
		const multicolorCardId = target?.cards[0];
		if (!target || !multicolorCardId) {
			throw new Error('Missing target player/card for multicolor redundancy test');
		}

		for (const cardId of target.cards) {
			const card = game.state.cards[cardId];
			card.suit = cardId === multicolorCardId ? 'M' : 'Y';
			card.hints.color = cardId === multicolorCardId ? 'M' : null;
			card.hints.notColors = cardId === multicolorCardId ? [] : ['G'];
		}

		const result = isRedundantHint(game.state, target.id, { hintType: 'color', suit: 'G' });

		expect(result.touchedCardIds).toEqual([multicolorCardId]);
		expect(result.redundant).toBeTrue();
	});
});
