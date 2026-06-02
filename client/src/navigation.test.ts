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

	test('keeps the stored room available without resolving it as the home room', () => {
		setStoredRoomCode('abcd');

		expect(getStoredRoomCode()).toBe('ABCD');
		expect(resolveHomeRoom(undefined)).toBeNull();
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
