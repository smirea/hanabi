// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import App from './App';

const ROOM_CODE = 'ABCD';

function getHintCount(): number {
  const raw = screen.getByTestId('status-hints-count').textContent;
  if (!raw) {
    throw new Error('Missing hint count text');
  }

  return Number(raw);
}

function getFuseCount(): number {
  const raw = screen.getByTestId('status-fuses-count').textContent;
  if (!raw) {
    throw new Error('Missing fuse count text');
  }

  return Number(raw);
}

function getCardNumber(playerId: string, index: number): number | null {
  const text = screen.getByTestId(`card-${playerId}-${index}`).textContent ?? '';
  const value = Number(text.replace(/[^0-9]/g, '').slice(0, 1));
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    return null;
  }

  return value;
}

function getCardColorToken(playerId: string, index: number): string {
  const card = screen.getByTestId(`card-${playerId}-${index}`);
  return (card as HTMLElement).style.getPropertyValue('--card-bg').trim();
}

function findHintTargetByNumber(playerIds: string[]): string {
  const target = playerIds.find((playerId) => {
    const numbers = new Set<number>();
    for (let index = 0; index < 5; index += 1) {
      const number = getCardNumber(playerId, index);
      if (number !== null) numbers.add(number);
    }

    return numbers.size > 1;
  });

  if (!target) {
    throw new Error('Expected a target hand with at least two distinct card numbers');
  }

  return target;
}

function findHintTargetByColor(playerIds: string[]): string {
  const target = playerIds.find((playerId) => {
    const colors = new Set<string>();
    for (let index = 0; index < 5; index += 1) {
      const color = getCardColorToken(playerId, index);
      if (color.length > 0) colors.add(color);
    }

    return colors.size > 1;
  });

  if (!target) {
    throw new Error('Expected a target hand with at least two distinct card colors');
  }

  return target;
}

function findTeammateCardIndexWithNumberOverOne(playerId: string): number {
  for (let index = 0; index < 5; index += 1) {
    const number = getCardNumber(playerId, index);
    if (number !== null && [2, 3, 4, 5].includes(number)) {
      return index;
    }
  }

  throw new Error(`Could not find a guaranteed misplay card for ${playerId}`);
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('App local debug wiring', () => {
  beforeEach(() => {
    window.localStorage.setItem('hanabi.debug_mode', 'true');
  });

  test('play action resolves on card tap and swaps perspective to the next player', () => {
    render(<App roomCode={ROOM_CODE} />);

    expect(screen.getByTestId('player-turn-p1')).toBeInTheDocument();
    expect(screen.getByTestId('card-p1-0')).toHaveTextContent('?');

    fireEvent.click(screen.getByTestId('actions-play'));
    fireEvent.click(screen.getByTestId('card-p1-0'));

    expect(screen.queryByTestId('player-turn-p1')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-turn-p2')).toBeInTheDocument();
    expect(screen.getByTestId('card-p2-0')).toHaveTextContent('?');
    expect(screen.getByTestId('card-p1-0')).not.toHaveTextContent('?');
  });

  test('players are ordered by next turn from each viewer perspective', () => {
    render(<App roomCode={ROOM_CODE} />);

    const tableShell = screen.getByTestId('table-shell');
    const initialOrder = [...tableShell.querySelectorAll('article.player')]
      .map((node) => node.getAttribute('data-testid'));
    expect(initialOrder).toEqual(['player-p2', 'player-p3', 'player-p1']);

    fireEvent.click(screen.getByTestId('actions-play'));
    fireEvent.click(screen.getByTestId('card-p1-0'));

    const nextOrder = [...tableShell.querySelectorAll('article.player')]
      .map((node) => node.getAttribute('data-testid'));
    expect(nextOrder).toEqual(['player-p3', 'player-p1', 'player-p2']);
  });

  test('number hint resolves from tapped target card and consumes one hint token', () => {
    render(<App roomCode={ROOM_CODE} />);

    const startHints = getHintCount();

    fireEvent.click(screen.getByTestId('actions-number'));
    fireEvent.click(screen.getByTestId('card-p2-0'));

    expect(getHintCount()).toBe(startHints - 1);
    expect(screen.getByTestId('player-turn-p2')).toBeInTheDocument();
  });

  test('fuses start full and decrease after a misplay', () => {
    render(<App roomCode={ROOM_CODE} />);

    expect(getFuseCount()).toBe(3);

    const blairMisplayIndex = findTeammateCardIndexWithNumberOverOne('p2');

    fireEvent.click(screen.getByTestId('actions-number'));
    fireEvent.click(screen.getByTestId('card-p3-0'));

    fireEvent.click(screen.getByTestId('actions-play'));
    fireEvent.click(screen.getByTestId(`card-p2-${blairMisplayIndex}`));

    expect(getFuseCount()).toBe(2);
  });

  test('burger menu toggles debug mode persisted in local storage', () => {
    render(<App roomCode={ROOM_CODE} />);

    fireEvent.click(screen.getByTestId('actions-menu'));
    expect(screen.getByTestId('menu-local-debug-value')).toHaveTextContent('On');

    fireEvent.click(screen.getByTestId('menu-local-debug-toggle'));
    expect(window.localStorage.getItem('hanabi.debug_mode')).toBe('false');
    expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
    expect(screen.queryByTestId('actions-play')).not.toBeInTheDocument();
  });

  test('negative hint toggles default to on and persist in local storage', () => {
    render(<App roomCode={ROOM_CODE} />);

    fireEvent.click(screen.getByTestId('actions-menu'));
    expect(screen.getByTestId('menu-negative-color-value')).toHaveTextContent('On');
    expect(screen.getByTestId('menu-negative-number-value')).toHaveTextContent('On');

    fireEvent.click(screen.getByTestId('menu-negative-color-toggle'));
    expect(window.localStorage.getItem('hanabi.negative_color_hints')).toBe('false');
    fireEvent.click(screen.getByTestId('actions-menu'));
    expect(screen.getByTestId('menu-negative-color-value')).toHaveTextContent('Off');

    fireEvent.click(screen.getByTestId('menu-negative-number-toggle'));
    expect(window.localStorage.getItem('hanabi.negative_number_hints')).toBe('false');
    fireEvent.click(screen.getByTestId('actions-menu'));
    expect(screen.getByTestId('menu-negative-number-value')).toHaveTextContent('Off');
  });

  test('negative hint toggles hide badges when turned off', () => {
    render(<App roomCode={ROOM_CODE} />);

    const colorTargetPlayer = findHintTargetByColor(['p2', 'p3']);
    fireEvent.click(screen.getByTestId('actions-color'));
    fireEvent.click(screen.getByTestId(`card-${colorTargetPlayer}-0`));
    expect(document.querySelectorAll('.badge.not-color').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('actions-menu'));
    fireEvent.click(screen.getByTestId('menu-negative-color-toggle'));
    expect(document.querySelectorAll('.badge.not-color').length).toBe(0);

    const numberTargetPlayer = findHintTargetByNumber(['p2', 'p3']);
    fireEvent.click(screen.getByTestId('actions-number'));
    fireEvent.click(screen.getByTestId(`card-${numberTargetPlayer}-0`));
    expect(document.querySelectorAll('.badge.not-number').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('actions-menu'));
    fireEvent.click(screen.getByTestId('menu-negative-number-toggle'));
    expect(document.querySelectorAll('.badge.not-number').length).toBe(0);
  });

  test('turn sound toggle defaults on and persists from burger menu', () => {
    render(<App roomCode={ROOM_CODE} />);

    fireEvent.click(screen.getByTestId('actions-menu'));
    expect(screen.getByTestId('menu-turn-sound-value')).toHaveTextContent('On');

    fireEvent.click(screen.getByTestId('menu-turn-sound-toggle'));
    expect(window.localStorage.getItem('hanabi.turn_sound_enabled')).toBe('false');

    fireEvent.click(screen.getByTestId('actions-menu'));
    expect(screen.getByTestId('menu-turn-sound-value')).toHaveTextContent('Off');
  });

  test('dark mode toggle persists from burger menu and updates the document theme', async () => {
    render(<App roomCode={ROOM_CODE} />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    fireEvent.click(screen.getByTestId('actions-menu'));
    fireEvent.click(screen.getByTestId('menu-dark-mode-toggle'));

    expect(window.localStorage.getItem('hanabi.dark_mode')).toBe('true');
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  test('non-debug mode renders the staging lobby flow', () => {
    window.localStorage.setItem('hanabi.debug_mode', 'false');
    render(<App roomCode={ROOM_CODE} />);

    expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-waiting-host')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-start')).not.toBeInTheDocument();
  });

  test('dark mode toggle is available on the lobby landing screen', async () => {
    window.localStorage.setItem('hanabi.debug_mode', 'false');
    render(<App roomCode={ROOM_CODE} />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    fireEvent.click(screen.getByTestId('lobby-theme-toggle'));

    expect(window.localStorage.getItem('hanabi.dark_mode')).toBe('true');
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  test('staging lobby player name persists in local storage', () => {
    window.localStorage.setItem('hanabi.debug_mode', 'false');
    render(<App roomCode={ROOM_CODE} />);

    const input = screen.getByTestId('lobby-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Stefan' } });
    expect(window.localStorage.getItem('hanabi.player_name')).toBe(JSON.stringify('Stefan'));

    cleanup();
    render(<App roomCode={ROOM_CODE} />);
    expect(screen.getByTestId('lobby-name-input')).toHaveValue('Stefan');
  });

  test('staging lobby room follows the explicit room code prop', () => {
    window.localStorage.setItem('hanabi.debug_mode', 'false');
    window.history.replaceState(null, '', '/?room=alpha_7');
    render(<App roomCode={ROOM_CODE} />);

    expect(screen.getByTestId('lobby-room-code')).toHaveTextContent(ROOM_CODE);
    expect(screen.queryByTestId('lobby-room-input')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?room=alpha_7');
  });

  test('debug network frames namespace player config by debug id', () => {
    window.location.hash = '#debug-1';
    window.localStorage.setItem('hanabi.player_name', JSON.stringify('Global'));
    window.localStorage.setItem('hanabi.player_name.dbg-1', JSON.stringify('Alice'));

    render(<App roomCode={ROOM_CODE} />);
    const input = screen.getByTestId('lobby-name-input') as HTMLInputElement;
    expect(input.value).toBe('Alice');

    fireEvent.change(input, { target: { value: 'Bob' } });
    expect(window.localStorage.getItem('hanabi.player_name.dbg-1')).toBe(JSON.stringify('Bob'));
    expect(window.localStorage.getItem('hanabi.player_name')).toBe(JSON.stringify('Global'));
  });

  test('debug network frame refreshes namespaced local storage when hash changes', async () => {
    window.location.hash = '#debug-1';
    window.localStorage.setItem('hanabi.player_name.dbg-1', JSON.stringify('Alice'));
    window.localStorage.setItem('hanabi.player_name.dbg-2', JSON.stringify('Blair'));

    render(<App roomCode={ROOM_CODE} />);

    expect(screen.getByTestId('lobby-name-input')).toHaveValue('Alice');

    window.location.hash = '#debug-2';
    window.dispatchEvent(new Event('hashchange'));

    await waitFor(() => {
      expect(screen.getByTestId('lobby-name-input')).toHaveValue('Blair');
    });
  });

  test('debug network shell switches iframe hash between local simulated players', () => {
    window.localStorage.setItem('hanabi.debug_network_shell', 'true');
    window.localStorage.setItem('hanabi.debug_network_players', JSON.stringify(['1', '2']));
    window.localStorage.setItem('hanabi.debug_network_active_player', JSON.stringify('1'));

    render(<App roomCode={ROOM_CODE} />);

    const frame = screen.getByTestId('debug-network-frame');
    expect(frame.getAttribute('src')).toContain('#debug-1');

    fireEvent.click(screen.getByTestId('debug-network-player-2'));
    expect(frame.getAttribute('src')).toContain('#debug-2');

    fireEvent.click(screen.getByTestId('debug-network-add'));
    expect(screen.getByTestId('debug-network-player-3')).toBeInTheDocument();
    expect(frame.getAttribute('src')).toContain('#debug-3');

    fireEvent.click(screen.getByTestId('debug-network-remove'));
    expect(screen.queryByTestId('debug-network-player-3')).not.toBeInTheDocument();
    expect(frame.getAttribute('src')).toContain('#debug-2');
  });
});

describe('App session hash namespaces local storage', () => {
  test('player name writes to the session namespace when #session_* is present', () => {
    window.location.hash = '#session_123';
    window.localStorage.setItem('hanabi.debug_mode.sess-session_123', 'false');

    render(<App roomCode={ROOM_CODE} />);

    const input = screen.getByTestId('lobby-name-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Alice' } });

    expect(window.localStorage.getItem('hanabi.player_name.sess-session_123')).toBe(JSON.stringify('Alice'));
    expect(window.localStorage.getItem('hanabi.player_name')).toBeNull();
  });
});

describe('App room-code validation', () => {
  test('rejects non-4-letter room codes', () => {
    expect(() => render(<App roomCode="alpha_7" />)).toThrow('Room codes must be 4 letters.');
  });
});
