export function LobbyWaitingForSnapshot({
  roomId,
  onReconnect,
  onLeaveRoom
}: {
  roomId: string;
  onReconnect: () => void;
  onLeaveRoom: (() => void) | null;
}) {
  return (
    <main className="app lobby-app" data-testid="lobby-root">
      <section className="lobby-shell-body lobby-shell-body-full">
        <section className="lobby-card lobby-card-compact">
          <p className="lobby-note warning">Waiting for room snapshot in room {roomId}.</p>
          <div className="room-wait-actions">
            <button
              type="button"
              className="lobby-button primary"
              onClick={onReconnect}
              data-testid="lobby-reconnect"
            >
              Reconnect
            </button>
            {onLeaveRoom && (
              <button
                type="button"
                className="lobby-button subtle"
                onClick={onLeaveRoom}
                data-testid="lobby-leave-room"
              >
                Leave
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
