import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'bun:test';
import { useWebStorageState } from './useWebStorageState';

function LocalHarness() {
	const [value, setValue] = useWebStorageState('localStorage', 'debug_mode', false);
	return (
		<button type='button' data-testid='local-toggle' onClick={() => setValue(current => !current)}>
			{String(value)}
		</button>
	);
}

function SessionHarness() {
	const [value, setValue] = useWebStorageState('sessionStorage', 'dark_mode', false);
	return (
		<button type='button' data-testid='session-toggle' onClick={() => setValue(current => !current)}>
			{String(value)}
		</button>
	);
}

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	window.sessionStorage.clear();
	window.history.replaceState(null, '', '/');
});

describe('useWebStorageState', () => {
	test('hydrates from localStorage and persists updates', () => {
		window.localStorage.setItem('hanabi.debug_mode', 'true');
		render(<LocalHarness />);

		expect(screen.getByTestId('local-toggle')).toHaveTextContent('true');

		fireEvent.click(screen.getByTestId('local-toggle'));
		expect(window.localStorage.getItem('hanabi.debug_mode')).toBe('false');
	});

	test('adds the debug_id query param to the resolved storage key', () => {
		window.history.replaceState(null, '', '/?debug_id=tab-2');
		render(<LocalHarness />);
		fireEvent.click(screen.getByTestId('local-toggle'));

		expect(window.localStorage.getItem('hanabi.debug_mode.dbg-tab-2')).toBe('true');
		expect(window.localStorage.getItem('hanabi.debug_mode')).toBeNull();
	});

	test('supports sessionStorage target', () => {
		render(<SessionHarness />);
		fireEvent.click(screen.getByTestId('session-toggle'));

		expect(window.sessionStorage.getItem('hanabi.dark_mode')).toBe('true');
	});
});
