// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { useWebStorageState } from './useWebStorageState';

function LocalHarness({ namespace = null }: { namespace?: string | null }) {
  const [value, setValue] = useWebStorageState('localStorage', 'debug_mode', false, namespace);
  return (
    <button type="button" data-testid="local-toggle" onClick={() => setValue((current) => !current)}>
      {String(value)}
    </button>
  );
}

function SessionHarness() {
  const [value, setValue] = useWebStorageState('sessionStorage', 'tv_mode', false);
  return (
    <button type="button" data-testid="session-toggle" onClick={() => setValue((current) => !current)}>
      {String(value)}
    </button>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('useWebStorageState', () => {
  test('hydrates from localStorage and persists updates', () => {
    window.localStorage.setItem('hanabi.debug_mode', 'true');
    render(<LocalHarness />);

    expect(screen.getByTestId('local-toggle')).toHaveTextContent('true');

    fireEvent.click(screen.getByTestId('local-toggle'));
    expect(window.localStorage.getItem('hanabi.debug_mode')).toBe('false');
  });

  test('uses namespaced keys when namespace is provided', () => {
    render(<LocalHarness namespace="dbg-1" />);
    fireEvent.click(screen.getByTestId('local-toggle'));

    expect(window.localStorage.getItem('hanabi.debug_mode.dbg-1')).toBe('true');
    expect(window.localStorage.getItem('hanabi.debug_mode')).toBeNull();
  });

  test('supports sessionStorage target', () => {
    render(<SessionHarness />);
    fireEvent.click(screen.getByTestId('session-toggle'));

    expect(window.sessionStorage.getItem('hanabi.tv_mode')).toBe('true');
  });
});
