import { Moon, SignOut, Sun } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { MAX_PLAYER_NAME_LENGTH } from '../../../utils/constants';
import type { LobbySettings, RoomMemberView } from '../../../utils/types';

export function LobbyScreen({
	roomId,
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
	onLeaveRoom,
	isDarkMode,
	onToggleDarkMode,
	onEnableDebugMode,
	onUpdateSettings,
}: {
	roomId: string;
	members: readonly RoomMemberView[];
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
	onLeaveRoom: (() => void) | null;
	isDarkMode: boolean;
	onToggleDarkMode: () => void;
	onEnableDebugMode: (() => void) | null;
	onUpdateSettings: (next: Partial<LobbySettings>) => void;
}) {
	const effectiveMembers = selfId
		? members.map(member => (member.peerId === selfId ? { ...member, isTv: selfIsTv } : member))
		: members;
	const seatedCount = effectiveMembers.filter(member => !member.isTv).length;
	const tvCount = effectiveMembers.length - seatedCount;
	const host = effectiveMembers.find(member => member.peerId === hostId) ?? null;
	const canStart = phase === 'lobby' && seatedCount >= 2 && seatedCount <= 5;
	const playerCountError = seatedCount > 5 ? 'Max 5 players' : seatedCount < 2 ? 'Need at least 2 players' : null;
	const [isConfigMenuOpen, setIsConfigMenuOpen] = useState(false);
	const configMenuRef = useRef<HTMLDivElement | null>(null);

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
	const extraSuitRow = {
		id: 'extra-suit',
		label: 'Extra suit (M)',
		subtitle: 'Adds a 5-card multicolor suit (M); color hints use base suits only.',
		value: settings.includeMulticolor ? 'On' : 'Off',
		disabled: false,
		onClick: () => {
			const nextIncludeMulticolor = !settings.includeMulticolor;
			onUpdateSettings({
				includeMulticolor: nextIncludeMulticolor,
				multicolorShortDeck: nextIncludeMulticolor,
				multicolorWildHints: nextIncludeMulticolor,
			});
		},
	} as const;
	const endlessRow = {
		id: 'endless',
		label: 'Endless mode',
		subtitle: 'Keep playing after the deck runs out.',
		value: settings.endlessMode ? 'On' : 'Off',
		disabled: false,
		onClick: () => onUpdateSettings({ endlessMode: !settings.endlessMode }),
	} as const;
	const configRows = [extraSuitRow, endlessRow];

	return (
		<main className='app lobby-app' data-testid='lobby-root'>
			<section className='lobby-shell-body lobby-shell-body-full'>
				<section className='lobby-card'>
					<div className='lobby-topbar'>
						{onLeaveRoom ? (
							<button
								type='button'
								className='lobby-leave-btn'
								onClick={onLeaveRoom}
								data-testid='lobby-leave-room'
							>
								<SignOut size={14} weight='bold' aria-hidden />
								Leave
							</button>
						) : (
							<span />
						)}
						<p className='lobby-topbar-code' data-testid='lobby-room-code'>
							{roomId}
						</p>
					</div>

					<div className='lobby-info-row'>
						<label className='lobby-info-row-label' htmlFor='lobby-name-input'>Name</label>
						<input
							id='lobby-name-input'
							className='lobby-name-input'
							value={selfName}
							onChange={e => onSelfNameChange(e.target.value)}
							placeholder='Judy Hopps'
							maxLength={MAX_PLAYER_NAME_LENGTH}
							autoComplete='nickname'
							spellCheck={false}
							data-testid='lobby-name-input'
						/>
						<label className='lobby-tv-switch' data-testid='lobby-tv-toggle'>
							<input
								type='checkbox'
								className='lobby-tv-switch-input'
								checked={selfIsTv}
								onChange={e => onSelfIsTvChange(e.target.checked)}
							/>
							<span className='lobby-tv-switch-track'>
								<span className='lobby-tv-switch-thumb' />
							</span>
							<span className='lobby-tv-switch-label'>TV</span>
						</label>
					</div>

					{isGameInProgress && (
						<p className='lobby-note warning' data-testid='lobby-game-progress'>
							Game in progress. You will join next round from this room.
						</p>
					)}

					<section className='lobby-players'>
						<h2 className='lobby-section-title'>
							Players ({seatedCount}){tvCount > 0 ? ` + TVs (${tvCount})` : ''}
						</h2>
						<div className='lobby-player-list'>
							{effectiveMembers.map(member => (
								<article
									key={member.peerId}
									className={`lobby-player${member.peerId === selfId ? ' self' : ''}`}
									data-testid={`lobby-player-${member.peerId}`}
								>
									<div className='lobby-player-name'>{member.name}</div>
									<div className='lobby-chip-row'>
										{member.peerId === hostId && <span className='lobby-chip host'>Host</span>}
										{member.isTv && <span className='lobby-chip lobby-chip-tv'>TV</span>}
									</div>
								</article>
							))}
						</div>
					</section>

					<section className='lobby-settings'>
						<h2 className='lobby-section-title'>Configuration</h2>
						{isHost && phase === 'lobby' ? (
							<div className='lobby-toggle-list'>
								{configRows.map(row => (
									<button
										key={row.id}
										type='button'
										className='lobby-setting-toggle'
										onClick={row.onClick}
										disabled={row.disabled}
										data-testid={`lobby-setting-${row.id}`}
									>
										<span className='lobby-setting-text'>
											<span className='lobby-setting-label'>{row.label}</span>
											<span className='lobby-setting-subtitle'>{row.subtitle}</span>
										</span>
										<span className='lobby-setting-value'>{row.value}</span>
									</button>
								))}
							</div>
						) : (
							<div className='lobby-toggle-list' data-testid='lobby-settings-readonly'>
								{configRows.map(row => (
									<div key={row.id} className='lobby-setting-toggle readonly' aria-disabled='true'>
										<span className='lobby-setting-text'>
											<span className='lobby-setting-label'>{row.label}</span>
											<span className='lobby-setting-subtitle'>{row.subtitle}</span>
										</span>
										<span className='lobby-setting-value'>{row.value}</span>
									</div>
								))}
							</div>
						)}
					</section>

					{playerCountError && isHost && phase === 'lobby' && (
						<p className='lobby-note warning' data-testid='lobby-player-count-warning'>
							{playerCountError}
						</p>
					)}

					<section className='lobby-actions'>
						<div className='lobby-config-menu lobby-actions-config' ref={configMenuRef}>
							{onEnableDebugMode && (
								<>
									<button
										type='button'
										className='lobby-button subtle lobby-config-toggle'
										aria-haspopup='menu'
										aria-expanded={isConfigMenuOpen}
										aria-label='Open lobby settings'
										onClick={() => setIsConfigMenuOpen(open => !open)}
										data-testid='lobby-config-toggle'
									>
										⋯
									</button>
									{isConfigMenuOpen && (
										<div
											className='lobby-config-dropdown'
											role='menu'
											data-testid='lobby-config-dropdown'
										>
											<button
												type='button'
												className='lobby-config-dropdown-item'
												onClick={() => handleConfigAction(onEnableDebugMode)}
												role='menuitem'
												data-testid='lobby-debug-mode'
											>
												Debug local
											</button>
										</div>
									)}
								</>
							)}
						</div>

						{isHost && phase === 'lobby' ? (
							<button
								type='button'
								className='lobby-button primary lobby-action-main'
								onClick={onStart}
								disabled={!canStart}
								data-testid='lobby-start'
							>
								Start Game
							</button>
						) : (
							<p className='lobby-waiting lobby-action-main' data-testid='lobby-waiting-host'>
								Waiting on {host?.name ?? 'host'} to start.
							</p>
						)}
						<button
							type='button'
							className='lobby-button subtle lobby-theme-toggle-action'
							onClick={onToggleDarkMode}
							aria-pressed={isDarkMode}
							aria-label={isDarkMode ? 'Disable dark mode' : 'Enable dark mode'}
							data-testid='lobby-theme-toggle'
						>
							{isDarkMode ? (
								<Sun size={16} weight='fill' aria-hidden />
							) : (
								<Moon size={16} weight='fill' aria-hidden />
							)}
						</button>
					</section>
				</section>
			</section>
		</main>
	);
}
