import { useEffect, useMemo, useState } from 'react';
import {
  getDebugNetworkPlayerIdFromHash,
  getDebugNetworkPlayersFromRoom,
  syncDebugNetworkRoomPlayers,
  toDebugNetworkPlayerHash
} from './debugNetwork';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { parseRoomCode } from './roomCodes';
import { createDebugNamespace, createSessionNamespace, getSessionIdFromHash, storageKeys } from './storage';
import { areArraysEqual } from './utils/arrays';
import GameClient from './ui/game/GameClient';

function normalizeShellPlayers(input: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawValue of input) {
    if (typeof rawValue !== 'string') {
      continue;
    }

    const value = rawValue.trim();
    if (value.length === 0 || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  if (normalized.length === 0) {
    normalized.push('1');
  }

  return normalized;
}

function DebugNetworkShell({ onExit, storageNamespace }: { onExit: () => void; storageNamespace: string | null }) {
  const [storedPlayers, setStoredPlayers] = useLocalStorageState(
    storageKeys.debugNetworkPlayers,
    getDebugNetworkPlayersFromRoom(),
    storageNamespace
  );
  const normalizedPlayers = useMemo(() => normalizeShellPlayers(storedPlayers), [storedPlayers]);
  const [activePlayer, setActivePlayer] = useLocalStorageState(
    storageKeys.debugNetworkActivePlayer,
    normalizedPlayers[0],
    storageNamespace
  );

  useEffect(() => {
    if (areArraysEqual(storedPlayers, normalizedPlayers)) {
      return;
    }

    setStoredPlayers(normalizedPlayers);
  }, [normalizedPlayers, setStoredPlayers, storedPlayers]);

  useEffect(() => {
    if (normalizedPlayers.includes(activePlayer)) {
      return;
    }

    setActivePlayer(normalizedPlayers[0]);
  }, [activePlayer, normalizedPlayers, setActivePlayer]);

  useEffect(() => {
    syncDebugNetworkRoomPlayers(normalizedPlayers);
  }, [normalizedPlayers]);

  const iframeUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const url = new URL(window.location.href);
    url.hash = toDebugNetworkPlayerHash(activePlayer);
    return url.toString();
  }, [activePlayer]);

  function handleAddPlayer(): void {
    setStoredPlayers((currentPlayers) => {
      const normalized = normalizeShellPlayers(currentPlayers);
      const nextNumericId = normalized.reduce((max, playerId) => {
        const numeric = Number(playerId);
        if (!Number.isFinite(numeric)) {
          return max;
        }

        return Math.max(max, numeric);
      }, 0) + 1;
      const nextPlayerId = String(nextNumericId);
      setActivePlayer(nextPlayerId);
      return [...normalized, nextPlayerId];
    });
  }

  function handleRemovePlayer(): void {
    setStoredPlayers((currentPlayers) => {
      const normalized = normalizeShellPlayers(currentPlayers);
      if (normalized.length <= 1) {
        return normalized;
      }

      const activeIndex = normalized.indexOf(activePlayer);
      if (activeIndex === -1) {
        return normalized;
      }

      const nextPlayers = normalized.filter((playerId) => playerId !== activePlayer);
      const nextIndex = Math.min(activeIndex, nextPlayers.length - 1);
      setActivePlayer(nextPlayers[nextIndex]);
      return nextPlayers;
    });
  }

  function handleSelectPlayer(playerId: string): void {
    setActivePlayer(playerId);
  }

  return (
    <main className="debug-network-shell" data-testid="debug-network-shell">
      <iframe
        title={`Debug Network Player ${activePlayer}`}
        src={iframeUrl}
        className="debug-network-frame"
        data-testid="debug-network-frame"
      />

      <section className="debug-network-bar" data-testid="debug-network-bar">
        <div className="debug-network-player-list">
          {normalizedPlayers.map((playerId, index) => (
            <button
              type="button"
              key={playerId}
              className={`debug-network-player ${playerId === activePlayer ? 'active' : ''}`}
              data-testid={`debug-network-player-${playerId}`}
              onClick={() => handleSelectPlayer(playerId)}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div className="debug-network-controls">
          <button
            type="button"
            className="debug-network-control"
            onClick={handleAddPlayer}
            data-testid="debug-network-add"
          >
            Add
          </button>
          <button
            type="button"
            className="debug-network-control"
            onClick={handleRemovePlayer}
            data-testid="debug-network-remove"
          >
            Remove
          </button>
          <button
            type="button"
            className="debug-network-control"
            onClick={onExit}
            data-testid="debug-network-exit"
          >
            Exit
          </button>
        </div>
      </section>
    </main>
  );
}

function App({
  roomCode,
  onLeaveRoom
}: {
  roomCode: string;
  onLeaveRoom?: () => void;
}) {
  const parsedRoomCode = parseRoomCode(roomCode);
  if (!parsedRoomCode) {
    throw new Error(`Invalid room code "${roomCode}". Room codes must be 4 letters.`);
  }

  const roomId = parsedRoomCode;
  const [hash, setHash] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.location.hash;
  });
  const [debugFramePlayerId, setDebugFramePlayerId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return getDebugNetworkPlayerIdFromHash(window.location.hash);
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onHashChange = (): void => {
      const nextHash = window.location.hash;
      setHash(nextHash);
      setDebugFramePlayerId(getDebugNetworkPlayerIdFromHash(nextHash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const storageNamespace = useMemo(() => {
    if (debugFramePlayerId) {
      return createDebugNamespace(debugFramePlayerId);
    }

    const sessionId = getSessionIdFromHash(hash);
    return sessionId ? createSessionNamespace(sessionId) : null;
  }, [debugFramePlayerId, hash]);

  const [isDebugNetworkShellOpen, setIsDebugNetworkShellOpen] = useLocalStorageState(
    storageKeys.debugNetworkShell,
    false,
    storageNamespace
  );
  const [isDarkMode, setIsDarkMode] = useLocalStorageState(storageKeys.darkMode, false, storageNamespace);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    meta?.setAttribute('content', isDarkMode ? '#0b0d14' : '#f5f7fc');
  }, [isDarkMode]);

  if (debugFramePlayerId) {
    return (
      <GameClient
        runtime="debug-network-frame"
        framePlayerId={debugFramePlayerId}
        onOpenDebugNetworkShell={null}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((current) => !current)}
        roomId={roomId}
        onLeaveRoom={onLeaveRoom ?? null}
        storageNamespace={storageNamespace}
      />
    );
  }

  if (isDebugNetworkShellOpen) {
    return (
      <DebugNetworkShell
        onExit={() => setIsDebugNetworkShellOpen(false)}
        storageNamespace={storageNamespace}
      />
    );
  }

  return (
    <GameClient
      runtime="standard"
      framePlayerId={null}
      onOpenDebugNetworkShell={() => setIsDebugNetworkShellOpen(true)}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode((current) => !current)}
      roomId={roomId}
      onLeaveRoom={onLeaveRoom ?? null}
      storageNamespace={storageNamespace}
    />
  );
}

export default App;
