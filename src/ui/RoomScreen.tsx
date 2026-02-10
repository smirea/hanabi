import { useEffect, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import App from '../App';
import { isValidRoomCode, normalizeRoomCode } from '../roomCodes';

export function RoomScreen({ code }: { code: string }) {
  const navigate = useNavigate();
  const normalized = useMemo(() => normalizeRoomCode(code), [code]);
  const isValid = isValidRoomCode(normalized);
  const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

  useEffect(() => {
    if (!isValid) {
      return;
    }

    if (code !== normalized) {
      void navigate({
        to: '/room/$code',
        params: { code: normalized },
        hash: currentHash,
        replace: true
      });
    }
  }, [code, currentHash, isValid, navigate, normalized]);

  if (!isValid) {
    return (
      <main className="lobby" data-testid="room-invalid-root">
        <section className="lobby-card">
          <header className="lobby-header">
            <h1 className="lobby-title">Invalid Room</h1>
            <button
              type="button"
              className="lobby-button"
              onClick={() => void navigate({ to: '/', hash: currentHash })}
              data-testid="room-invalid-back"
            >
              Back
            </button>
          </header>
          <p className="lobby-note error">Room codes must be 4 letters (A-Z).</p>
        </section>
      </main>
    );
  }

  return (
    <App
      roomCode={normalized}
      onLeaveRoom={() => {
        void navigate({ to: '/', hash: currentHash });
      }}
    />
  );
}
