// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RoomScreen } from './RoomScreen';

const navigateMock = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock
}));

describe('RoomScreen', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
  });

  test('rejects legacy non-4-letter codes', () => {
    render(<RoomScreen code='alpha_7' />);

    expect(screen.getByTestId('room-invalid-root')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-root')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('normalizes valid 4-letter codes and canonicalizes URL search', async () => {
    render(<RoomScreen code='abCd' />);

    expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-room-code')).toHaveTextContent('ABCD');

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/',
        search: { room: 'ABCD' },
        hash: '',
        replace: true
      });
    });
  });

  test('does not navigate when already on canonical room URL', async () => {
    window.history.replaceState(null, '', '/?room=ABCD');

    render(<RoomScreen code='ABCD' />);

    expect(screen.getByTestId('lobby-root')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-room-code')).toHaveTextContent('ABCD');
    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
