import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createRoomCode, isValidRoomCode, normalizeRoomCode } from '../roomCodes';
import { useRoomDirectoryListing } from '../roomDirectory';

export function LobbyDirectory() {
  const navigate = useNavigate();
  const directory = useRoomDirectoryListing(true);
  const [joinInput, setJoinInput] = useState('');
  const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

  const normalizedJoin = useMemo(() => normalizeRoomCode(joinInput), [joinInput]);
  const canJoin = isValidRoomCode(normalizedJoin);

  const visibleRooms = useMemo(() => directory.rooms, [directory.rooms]);
  const statusLabel = directory.status === 'connected'
    ? 'Online'
    : directory.status === 'connecting'
      ? 'Connecting'
      : directory.status === 'error'
        ? 'Offline'
        : 'Idle';
  const visiblePlayers = useMemo(
    () => visibleRooms.reduce((count, room) => count + room.seatedCount, 0),
    [visibleRooms]
  );

  function goToRoom(code: string): void {
    void navigate({
      to: '/room/$code',
      params: { code },
      hash: currentHash
    });
  }

  function handleCreate(): void {
    goToRoom(createRoomCode());
  }

  function handleJoin(): void {
    if (!canJoin) {
      return;
    }

    goToRoom(normalizedJoin);
  }

  return (
    <main className="app lobby-app" data-testid="room-directory-root">
      <section className="stats lobby-shell-stats">
        <div className="stat lobby-shell-stat" data-testid="room-directory-shell-rooms">
          <span className="lobby-shell-stat-label">Rooms</span>
          <span className="lobby-shell-stat-value">{visibleRooms.length}</span>
        </div>
        <div className="stat lobby-shell-stat" data-testid="room-directory-shell-players">
          <span className="lobby-shell-stat-label">Players</span>
          <span className="lobby-shell-stat-value">{visiblePlayers}</span>
        </div>
        <div className="stat lobby-shell-stat" data-testid="room-directory-shell-status">
          <span className="lobby-shell-stat-label">Status</span>
          <span className="lobby-shell-stat-value">{statusLabel}</span>
        </div>
      </section>

      <section className="lobby-shell-banner">
        <p className="lobby-shell-kicker">Hanabi Online</p>
        <h1 className="lobby-shell-title">Welcome</h1>
        <p className="lobby-shell-subtitle">Create a room or join one with a 4-letter code.</p>
      </section>

      <section className="lobby-shell-body">
        <section className="lobby-card">
          <header className="lobby-header">
            <h2 className="lobby-title">Join Or Create</h2>
            <button
              type="button"
              className="lobby-button subtle"
              onClick={handleCreate}
              data-testid="room-directory-create"
            >
              New Room
            </button>
          </header>

          <section className="room-directory-join">
            <label className="room-directory-label" htmlFor="room-directory-code">Room code</label>
            <div className="room-directory-join-row">
              <input
                id="room-directory-code"
                className="room-directory-input"
                value={joinInput}
                onChange={(event) => setJoinInput(event.target.value)}
                placeholder="ABCD"
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={8}
                data-testid="room-directory-join-input"
              />
              <button
                type="button"
                className="lobby-button"
                onClick={handleJoin}
                disabled={!canJoin}
                data-testid="room-directory-join-button"
              >
                Join
              </button>
            </div>
            {joinInput.trim().length > 0 && !canJoin && (
              <p className="lobby-note" data-testid="room-directory-hint">Enter a 4-letter code.</p>
            )}
          </section>

          <section className="room-directory-list" data-testid="room-directory-list">
            <div className="room-directory-list-header">
              <h2 className="lobby-section-title">Open Rooms</h2>
              <span className="room-directory-status" data-testid="room-directory-status">
                {directory.status === 'connected'
                  ? `${visibleRooms.length} found`
                  : directory.status === 'connecting'
                    ? 'Connecting…'
                    : directory.status === 'error'
                      ? 'Offline'
                      : 'Idle'}
              </span>
            </div>

            {directory.error && (
              <p className="lobby-note error" data-testid="room-directory-error">{directory.error}</p>
            )}

            <div className="room-directory-room-list">
              {visibleRooms.length === 0 ? (
                <p className="lobby-note" data-testid="room-directory-empty">No open rooms yet.</p>
              ) : (
                visibleRooms.map((room) => (
                  <article
                    key={room.code}
                    className="room-directory-room"
                    data-testid={`room-directory-room-${room.code}`}
                  >
                    <div className="room-directory-room-meta">
                      <div className="room-directory-room-code">{room.code}</div>
                      <div className="room-directory-room-players" aria-label="Players">
                        {room.members.length === 0
                          ? 'Waiting…'
                          : room.members
                            .filter((member) => !member.isTv)
                            .map((member) => member.name)
                            .slice(0, 5)
                            .join(', ')}
                      </div>
                      <div className="room-directory-room-counts">
                        {room.seatedCount}p{room.tvCount > 0 ? ` + ${room.tvCount}tv` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="lobby-button"
                      onClick={() => goToRoom(room.code)}
                      data-testid={`room-directory-join-${room.code}`}
                    >
                      Join
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>

          <footer className="room-directory-footer">
            <p className="lobby-note">Room codes are 4 letters. Share the URL to invite others.</p>
          </footer>
        </section>
      </section>
    </main>
  );
}
