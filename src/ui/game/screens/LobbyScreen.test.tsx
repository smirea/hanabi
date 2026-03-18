import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { LobbySettings } from '../../../utils/types';
import { LobbyScreen } from './LobbyScreen';

function createProps(settings: LobbySettings, onUpdateSettings = mock(() => {})) {
	return {
		roomId: 'ABCD',
		status: 'connected' as const,
		error: null,
		members: [{ id: 'player:1', peerId: 'p1', name: 'Alex', isTv: false }],
		hostId: 'p1',
		isHost: true,
		selfId: 'p1',
		selfName: 'Alex',
		onSelfNameChange: mock(() => {}),
		selfIsTv: false,
		onSelfIsTvChange: mock(() => {}),
		phase: 'lobby' as const,
		settings,
		isGameInProgress: false,
		onStart: mock(() => {}),
		onLeaveRoom: null,
		isDarkMode: false,
		onToggleDarkMode: mock(() => {}),
		onEnableDebugMode: null,
		onUpdateSettings,
	};
}

describe('LobbyScreen', () => {
	afterEach(() => {
		cleanup();
	});

	test('hides multicolor-specific options when extra suit is disabled', () => {
		render(
			<LobbyScreen
				{...createProps({
					includeMulticolor: false,
					multicolorShortDeck: false,
					multicolorWildHints: false,
					endlessMode: false,
				})}
			/>,
		);

		expect(screen.getByTestId('lobby-setting-extra-suit')).toBeInTheDocument();
		expect(screen.queryByTestId('lobby-setting-short-deck')).not.toBeInTheDocument();
		expect(screen.queryByTestId('lobby-setting-wild-multicolor')).not.toBeInTheDocument();
	});

	test('does not show additional multicolor sub-options when extra suit is enabled', () => {
		render(
			<LobbyScreen
				{...createProps({
					includeMulticolor: true,
					multicolorShortDeck: false,
					multicolorWildHints: true,
					endlessMode: false,
				})}
			/>,
		);

		expect(screen.queryByTestId('lobby-setting-short-deck')).not.toBeInTheDocument();
		expect(screen.queryByTestId('lobby-setting-wild-multicolor')).not.toBeInTheDocument();
	});

	test('enabling extra suit defaults to short multicolor with base-color clues', () => {
		const onUpdateSettings = mock(() => {});
		render(
			<LobbyScreen
				{...createProps(
					{
						includeMulticolor: false,
						multicolorShortDeck: false,
						multicolorWildHints: false,
						endlessMode: false,
					},
					onUpdateSettings,
				)}
			/>,
		);

		fireEvent.click(screen.getByTestId('lobby-setting-extra-suit'));

		expect(onUpdateSettings).toHaveBeenCalledWith({
			includeMulticolor: true,
			multicolorShortDeck: true,
			multicolorWildHints: true,
		});
	});
});
