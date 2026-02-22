import { GearSix, Moon, Sun } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { LobbySettings, OnlineState, RoomMember } from '../../../network';

export function LobbyScreen({
  roomId,
  status,
  error,
  members,
  hostId,
  isHost,
  selfId,
  selfName,
  onSelfNameChange,
  selfIsTv,
  onSelfIsTvChange,
  phase,
  settings,
  isGameInProgress,
  onStart,
  onReconnect,
  onLeaveRoom,
  isDarkMode,
  onToggleDarkMode,
  onEnableDebugMode,
  onEnableDebugNetwork,
  onUpdateSettings
}: {
  roomId: string;
  status: OnlineState['status'];
  error: string | null;
  members: RoomMember[];
  hostId: string | null;
  isHost: boolean;
  selfId: string | null;
  selfName: string;
  onSelfNameChange: (next: string) => void;
  selfIsTv: boolean;
  onSelfIsTvChange: (next: boolean) => void;
  phase: 'lobby' | 'playing';
  settings: LobbySettings;
  isGameInProgress: boolean;
  onStart: () => void;
  onReconnect: () => void;
  onLeaveRoom: (() => void) | null;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onEnableDebugMode: (() => void) | null;
  onEnableDebugNetwork: (() => void) | null;
  onUpdateSettings: (next: Partial<LobbySettings>) => void;
}) {
  const effectiveMembers = selfId
    ? members.map((member) => (member.peerId === selfId ? { ...member, isTv: selfIsTv } : member))
    : members;
  const seatedCount = effectiveMembers.filter((member) => !member.isTv).length;
  const tvCount = effectiveMembers.length - seatedCount;
  const host = effectiveMembers.find((member) => member.peerId === hostId) ?? null;
  const canStart = phase === 'lobby' && seatedCount >= 2 && seatedCount <= 5;
  const showReconnect = status !== 'connected' || error !== null;
  const playerCountError = seatedCount > 5 ? 'Max 5 players' : (seatedCount < 2 ? 'Need at least 2 players' : null);
  const handSize = seatedCount <= 3 ? 5 : 4;
  const deckSize = 50 + (settings.includeMulticolor ? (settings.multicolorShortDeck ? 5 : 10) : 0);
  const maxScore = (settings.includeMulticolor ? 6 : 5) * 5;
  const defaultNamePlaceholder = selfId ? `Player ${selfId.slice(-4).toUpperCase()}` : 'Player';
  const [isConfigMenuOpen, setIsConfigMenuOpen] = useState(false);
  const configMenuRef = useRef<HTMLDivElement | null>(null);
  const hasDebugActions = Boolean(onEnableDebugMode || onEnableDebugNetwork);

  useEffect(() => {
    if (!isConfigMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      const menuNode = configMenuRef.current;
      if (!menuNode) {
        setIsConfigMenuOpen(false);
        return;
      }

      if (!menuNode.contains(event.target as Node)) {
        setIsConfigMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsConfigMenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isConfigMenuOpen]);

  function handleConfigAction(action: () => void): void {
    setIsConfigMenuOpen(false);
    action();
  }
  const configRows = [
    {
      id: 'extra-suit',
      label: 'Extra suit (M)',
      subtitle: 'Adds the multicolor suit (M) to the deck and fireworks.',
      value: settings.includeMulticolor ? 'On' : 'Off',
      disabled: false,
      onClick: () => {
        const nextIncludeMulticolor = !settings.includeMulticolor;
        onUpdateSettings({
          includeMulticolor: nextIncludeMulticolor,
          multicolorShortDeck: nextIncludeMulticolor
            ? (settings.includeMulticolor ? settings.multicolorShortDeck : true)
            : false,
          multicolorWildHints: nextIncludeMulticolor ? settings.multicolorWildHints : false
        });
      }
    },
    {
      id: 'short-deck',
      label: 'Multicolor short deck',
      subtitle: 'Uses 5 multicolor cards instead of the full 10.',
      value: settings.multicolorShortDeck ? 'On' : 'Off',
      disabled: !settings.includeMulticolor,
      onClick: () => onUpdateSettings({
        multicolorShortDeck: !settings.multicolorShortDeck,
        multicolorWildHints: false
      })
    },
    {
      id: 'wild-multicolor',
      label: 'Wild multicolor hints',
      subtitle: 'Color hints can point at any multicolor card (M).',
      value: settings.multicolorWildHints ? 'On' : 'Off',
      disabled: !settings.includeMulticolor,
      onClick: () => onUpdateSettings({
        multicolorWildHints: !settings.multicolorWildHints,
        multicolorShortDeck: false
      })
    },
    {
      id: 'endless',
      label: 'Endless mode',
      subtitle: 'Keep playing after the deck runs out.',
      value: settings.endlessMode ? 'On' : 'Off',
      disabled: false,
      onClick: () => onUpdateSettings({ endlessMode: !settings.endlessMode })
    }
  ] as const;

  return (
    <main className="app lobby-app" data-testid="lobby-root">
      <section className="lobby-shell-body lobby-shell-body-full">
        <section className="lobby-card">
        <div className="lobby-summary">
          <div className="lobby-identity-grid" data-testid="lobby-identity-grid">
            <div className="lobby-identity-field">
              <label className="lobby-identity-label" htmlFor="lobby-name-input">Name</label>
              <input
                id="lobby-name-input"
                className="lobby-name-input"
                value={selfName}
                onChange={(event) => onSelfNameChange(event.target.value)}
                placeholder={defaultNamePlaceholder}
                maxLength={24}
                autoComplete="nickname"
                spellCheck={false}
                data-testid="lobby-name-input"
              />
            </div>
            <div className="lobby-identity-field">
              <span className="lobby-identity-label">Room</span>
              <p className="lobby-room-code" data-testid="lobby-room-code">{roomId}</p>
            </div>
          </div>

          {error && (
            <p className="lobby-note error" data-testid="lobby-error">
              {error}
            </p>
          )}

          {isGameInProgress && (
            <p className="lobby-note warning" data-testid="lobby-game-progress">
              Game in progress. You will join next round from this room.
            </p>
          )}
        </div>

        <section className="lobby-players">
          <h2 className="lobby-section-title">
            Players ({seatedCount}){tvCount > 0 ? ` + TVs (${tvCount})` : ''}
          </h2>
          <div className="lobby-player-list">
            {effectiveMembers.map((member) => (
              <article
                key={member.peerId}
                className={`lobby-player${member.peerId === selfId ? ' self' : ''}`}
                data-testid={`lobby-player-${member.peerId}`}
              >
                <div>
                  <div className="lobby-player-name">{member.name}</div>
                </div>
                <div className="lobby-chip-row">
                  {member.peerId === hostId && <span className="lobby-chip host">Host</span>}
                  {member.isTv && member.peerId !== selfId && <span className="lobby-chip tv">TV</span>}
                  {member.peerId === selfId && (
                    <button
                      type="button"
                      className={`lobby-tv-toggle ${selfIsTv ? 'on' : 'off'}`}
                      onClick={() => onSelfIsTvChange(!selfIsTv)}
                      aria-pressed={selfIsTv}
                      aria-label={selfIsTv ? 'Disable TV mode' : 'Enable TV mode'}
                      data-testid="lobby-tv-toggle"
                    >
                      TV
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lobby-settings">
          <h2 className="lobby-section-title">Configuration</h2>
          {isHost && phase === 'lobby' ? (
            <div className="lobby-toggle-list">
              {configRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="lobby-setting-toggle"
                  onClick={row.onClick}
                  disabled={row.disabled}
                  data-testid={`lobby-setting-${row.id}`}
                >
                  <span className="lobby-setting-text">
                    <span className="lobby-setting-label">{row.label}</span>
                    <span className="lobby-setting-subtitle">{row.subtitle}</span>
                  </span>
                  <span className="lobby-setting-value">{row.value}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="lobby-toggle-list" data-testid="lobby-settings-readonly">
              {configRows.map((row) => (
                <div key={row.id} className="lobby-setting-toggle readonly" aria-disabled="true">
                  <span className="lobby-setting-text">
                    <span className="lobby-setting-label">{row.label}</span>
                    <span className="lobby-setting-subtitle">{row.subtitle}</span>
                  </span>
                  <span className="lobby-setting-value">{row.value}</span>
                </div>
              ))}
            </div>
          )}
          <ul className="lobby-settings-list" data-testid="lobby-settings-derived">
            <li>Hand size: {handSize}</li>
            <li>Deck size: {deckSize}</li>
            <li>Max score: {maxScore}</li>
          </ul>
        </section>

        {playerCountError && isHost && phase === 'lobby' && (
          <p className="lobby-note warning" data-testid="lobby-player-count-warning">
            {playerCountError}
          </p>
        )}

        <section className="lobby-actions">
          <div className="lobby-config-menu lobby-actions-config" ref={configMenuRef}>
            <button
              type="button"
              className="lobby-button subtle lobby-config-toggle"
              aria-haspopup="menu"
              aria-expanded={isConfigMenuOpen}
              aria-label="Open lobby settings"
              onClick={() => setIsConfigMenuOpen((open) => !open)}
              data-testid="lobby-config-toggle"
            >
              <GearSix size={16} weight="bold" aria-hidden />
            </button>
            {isConfigMenuOpen && (
              <div className="lobby-config-dropdown" role="menu" data-testid="lobby-config-dropdown">
                {onLeaveRoom && (
                  <button
                    type="button"
                    className="lobby-config-dropdown-item"
                    onClick={() => handleConfigAction(onLeaveRoom)}
                    role="menuitem"
                    data-testid="lobby-leave-room"
                  >
                    Leave room
                  </button>
                )}
                {onLeaveRoom && hasDebugActions && (
                  <div className="lobby-config-divider" role="separator" />
                )}
                {onEnableDebugMode && (
                  <button
                    type="button"
                    className="lobby-config-dropdown-item"
                    onClick={() => handleConfigAction(onEnableDebugMode)}
                    role="menuitem"
                    data-testid="lobby-debug-mode"
                  >
                    Debug local
                  </button>
                )}
                {onEnableDebugNetwork && (
                  <button
                    type="button"
                    className="lobby-config-dropdown-item"
                    onClick={() => handleConfigAction(onEnableDebugNetwork)}
                    role="menuitem"
                    data-testid="lobby-debug-network"
                  >
                    Debug network
                  </button>
                )}
              </div>
            )}
          </div>

          {showReconnect && (
            <button type="button" className="lobby-button lobby-reconnect" onClick={onReconnect} data-testid="lobby-reconnect">
              Reconnect
            </button>
          )}
          {isHost && phase === 'lobby' ? (
            <button
              type="button"
              className="lobby-button primary lobby-action-main"
              onClick={onStart}
              disabled={!canStart}
              data-testid="lobby-start"
            >
              Start Game
            </button>
          ) : (
            <p className="lobby-waiting lobby-action-main" data-testid="lobby-waiting-host">
              Waiting on {host?.name ?? 'host'} to start.
            </p>
          )}
          <button
            type="button"
            className="lobby-button subtle lobby-theme-toggle-action"
            onClick={onToggleDarkMode}
            aria-pressed={isDarkMode}
            aria-label={isDarkMode ? 'Disable dark mode' : 'Enable dark mode'}
            data-testid="lobby-theme-toggle"
          >
            {isDarkMode ? <Sun size={16} weight="fill" aria-hidden /> : <Moon size={16} weight="fill" aria-hidden />}
          </button>
        </section>
        </section>
      </section>
    </main>
  );
}
