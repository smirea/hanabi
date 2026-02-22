// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LobbySettings } from '../../../network';
import { LobbyScreen } from './LobbyScreen';

function createProps(settings: LobbySettings, onUpdateSettings = vi.fn()) {
  return {
    roomId: 'ABCD',
    status: 'connected' as const,
    error: null,
    members: [{ peerId: 'p1', name: 'Alex', isTv: false }],
    hostId: 'p1',
    isHost: true,
    selfId: 'p1',
    selfName: 'Alex',
    onSelfNameChange: vi.fn(),
    selfIsTv: false,
    onSelfIsTvChange: vi.fn(),
    phase: 'lobby' as const,
    settings,
    isGameInProgress: false,
    onStart: vi.fn(),
    onReconnect: vi.fn(),
    onLeaveRoom: null,
    isDarkMode: false,
    onToggleDarkMode: vi.fn(),
    onEnableDebugMode: null,
    onEnableDebugNetwork: null,
    onUpdateSettings
  };
}

describe('LobbyScreen', () => {
  afterEach(() => {
    cleanup();
  });

  test('hides multicolor-specific options when extra suit is disabled', () => {
    render(<LobbyScreen {...createProps({
      includeMulticolor: false,
      multicolorShortDeck: false,
      multicolorWildHints: false,
      endlessMode: false
    })} />);

    expect(screen.getByTestId('lobby-setting-extra-suit')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-setting-short-deck')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lobby-setting-wild-multicolor')).not.toBeInTheDocument();
  });

  test('shows multicolor-specific options when extra suit is enabled', () => {
    render(<LobbyScreen {...createProps({
      includeMulticolor: true,
      multicolorShortDeck: false,
      multicolorWildHints: true,
      endlessMode: false
    })} />);

    expect(screen.getByTestId('lobby-setting-short-deck')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-setting-wild-multicolor')).toBeInTheDocument();
  });

  test('enabling extra suit defaults to wild multicolor hints', () => {
    const onUpdateSettings = vi.fn();
    render(<LobbyScreen {...createProps({
      includeMulticolor: false,
      multicolorShortDeck: false,
      multicolorWildHints: false,
      endlessMode: false
    }, onUpdateSettings)} />);

    fireEvent.click(screen.getByTestId('lobby-setting-extra-suit'));

    expect(onUpdateSettings).toHaveBeenCalledWith({
      includeMulticolor: true,
      multicolorShortDeck: false,
      multicolorWildHints: true
    });
  });
});
