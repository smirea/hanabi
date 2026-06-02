import { afterEach, describe, expect, test } from 'bun:test';
import {
	clearStoredRoomCode,
	getLocationRoomSearch,
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

	test('falls back to the current URL room search when route search is missing', () => {
		window.history.replaceState(null, '', '/?room=wxyz');

		expect(getLocationRoomSearch()).toBe('wxyz');
		expect(resolveHomeRoom(undefined)).toBe('wxyz');
	});

	test('URL room search takes priority over stored room on refresh', () => {
		setStoredRoomCode('ABCD');
		window.history.replaceState(null, '', '/?room=WXYZ');

		expect(resolveHomeRoom(undefined)).toBe('WXYZ');
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
