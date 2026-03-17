import { describe, expect, test } from 'bun:test';
import { getPegPipStates } from './PegPips';

describe('getPegPipStates', () => {
	test('maps default mode to full and empty circles only', () => {
		expect(getPegPipStates('default', 1, 1, 1, 1, 4)).toEqual(['filled', 'filled', 'hollow', 'hollow']);
	});

	test('maps tibi mode to deck, hand, and discard icons', () => {
		expect(getPegPipStates('tibi', 1, 2, 1, 1, 4)).toEqual(['deck', 'hand', 'hand', 'cross']);
	});

	test('caps output to four pips', () => {
		expect(getPegPipStates('default', 4, 2, 2, 0, 8)).toEqual(['filled', 'filled', 'filled', 'filled']);
	});
});
