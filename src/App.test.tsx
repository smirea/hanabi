// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import App from './App';

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
});

describe('App local debug wiring', () => {
  test('play action resolves on card tap and swaps perspective to the next player', () => {
    render(<App />);

    expect(screen.getByTestId('player-turn-p1')).toBeInTheDocument();
    expect(screen.getByTestId('card-p1-0')).toHaveTextContent('?');

    fireEvent.click(screen.getByTestId('actions-play'));
    fireEvent.click(screen.getByTestId('card-p1-0'));

    expect(screen.queryByTestId('player-turn-p1')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-turn-p2')).toBeInTheDocument();
    expect(screen.getByTestId('card-p2-0')).toHaveTextContent('?');
    expect(screen.getByTestId('card-p1-0')).not.toHaveTextContent('?');
  });

  test('number hint resolves from tapped target card and consumes one hint token', () => {
    render(<App />);

    const startHints = getHintCount();

    fireEvent.click(screen.getByTestId('actions-number'));
    fireEvent.click(screen.getByTestId('card-p2-0'));

    expect(getHintCount()).toBe(startHints - 1);
    expect(screen.getByTestId('player-turn-p2')).toBeInTheDocument();
  });

  test('fuses start full and decrease after a misplay', () => {
    render(<App />);

    expect(getFuseCount()).toBe(3);

    const blairMisplayIndex = findTeammateCardIndexWithNumberOverOne('p2');

    fireEvent.click(screen.getByTestId('actions-number'));
    fireEvent.click(screen.getByTestId('card-p3-0'));

    fireEvent.click(screen.getByTestId('actions-play'));
    fireEvent.click(screen.getByTestId(`card-p2-${blairMisplayIndex}`));

    expect(getFuseCount()).toBe(2);
  });

  test('burger menu toggles debug mode persisted in local storage', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('actions-menu'));
    expect(screen.getByTestId('menu-debug-value')).toHaveTextContent('On');

    fireEvent.click(screen.getByTestId('menu-debug-toggle'));
    expect(window.localStorage.getItem('hanabi.debug_mode')).toBe('false');
    expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
    expect(screen.queryByTestId('actions-play')).not.toBeInTheDocument();
  });

  test('negative hint toggles default to on and persist in local storage', () => {
    render(<App />);

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
    render(<App />);

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

  test('non-debug mode renders the staging lobby flow', () => {
    window.localStorage.setItem('hanabi.debug_mode', 'false');
    render(<App />);

    expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-waiting-host')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-start')).not.toBeInTheDocument();
  });

  test('debug network shell switches iframe hash between local simulated players', () => {
    window.localStorage.setItem('hanabi.debug_network_shell', 'true');
    window.localStorage.setItem('hanabi.debug_network_players', JSON.stringify(['1', '2']));
    window.localStorage.setItem('hanabi.debug_network_active_player', JSON.stringify('1'));

    render(<App />);

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
