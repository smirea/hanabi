import { afterEach, describe, expect, test } from 'bun:test';
import {
	clearStoredRoomCode,
	getStoredRoomCode,
	resolveHomeRoom,
	setStoredRoomCode,
} from './navigation';
import { LS } from './utils/utils';

describe('room navigation persistence', () => {
	afterEach(() => {
		LS.clearAll();
		window.history.replaceState(null, '', '/');
	});

	test('restores the stored room when the home route has no room search param', () => {
		setStoredRoomCode('abcd');

		expect(getStoredRoomCode()).toBe('ABCD');
		expect(resolveHomeRoom(undefined)).toBe('ABCD');
	});

	test('explicit room search takes priority over the stored room', () => {
		setStoredRoomCode('ABCD');

		expect(resolveHomeRoom('WXYZ')).toBe('WXYZ');
		expect(resolveHomeRoom('legacy_7')).toBe('legacy_7');
	});

	test('stored room codes keep the initialized namespace when debug_id changes later', () => {
		window.history.replaceState(null, '', '/?debug_id=1');
		setStoredRoomCode('ABCD');

		window.history.replaceState(null, '', '/?debug_id=2');
		expect(getStoredRoomCode()).toBe('ABCD');

		clearStoredRoomCode();
		expect(getStoredRoomCode()).toBeNull();
	});
});
