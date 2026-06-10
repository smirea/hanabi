import {
	ArrowLeft,
	ArrowClockwise,
	ClockCounterClockwise,
	DoorOpen,
	Trash,
	Users,
} from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	deleteAdminGame,
	deleteAdminRoom,
	deleteAdminUser,
	loadAdminDebugSummary,
	type AdminDebugGame,
	type AdminDebugSummary,
	type AdminDebugUser,
} from '../adminDebugApi';
import { withPersistentSearch } from '../navigation';

function formatDay(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
	}).format(date);
}

function formatTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	}).format(date);
}

function dayKey(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function groupGamesByDay(games: AdminDebugGame[]) {
	const groups: Array<{ key: string; label: string; games: AdminDebugGame[] }> = [];

	for (const game of games) {
		const key = dayKey(game.endedAt);
		const current = groups[groups.length - 1];
		if (current?.key === key) {
			current.games.push(game);
			continue;
		}

		groups.push({ key, label: formatDay(game.endedAt), games: [game] });
	}

	return groups;
}

function plural(value: number, label: string): string {
	return `${value} ${label}${value === 1 ? '' : 's'}`;
}

export function AdminDebugScreen() {
	const navigate = useNavigate();
	const [summary, setSummary] = useState<AdminDebugSummary | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [busyAction, setBusyAction] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const gameGroups = useMemo(() => groupGamesByDay(summary?.games ?? []), [summary?.games]);
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	const reload = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			setSummary(await loadAdminDebugSummary());
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Unable to load admin data');
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const runAction = useCallback(
		async (key: string, action: () => Promise<unknown>) => {
			setBusyAction(key);
			setError(null);
			try {
				await action();
				await reload();
			} catch (error) {
				setError(error instanceof Error ? error.message : 'Admin action failed');
			} finally {
				setBusyAction(null);
			}
		},
		[reload],
	);

	const deleteRoom = (roomCode: string) => {
		if (!window.confirm(`Delete room ${roomCode}? Connected players will be kicked home.`)) return;
		void runAction(`room:${roomCode}`, () => deleteAdminRoom(roomCode));
	};

	const deleteUser = (user: AdminDebugUser) => {
		if (
			!window.confirm(`Delete ${user.name}? Their stored actions and user record will be removed.`)
		)
			return;
		void runAction(`user:${user.id}`, () =>
			deleteAdminUser({ userId: user.userId, name: user.userId ? null : user.name }),
		);
	};

	const deleteGame = (game: AdminDebugGame) => {
		if (!window.confirm(`Delete the ${formatTime(game.endedAt)} game in room ${game.roomCode}?`))
			return;
		void runAction(`game:${game.id}`, () => deleteAdminGame(game.id));
	};

	return (
		<main className='app lobby-app admin-debug-app' data-testid='admin-debug-root'>
			<section className='lobby-shell-body lobby-shell-body-full'>
				<section className='lobby-card admin-debug-panel' aria-label='Admin Debug'>
					<header className='admin-debug-header'>
						<button
							type='button'
							className='lobby-leave-btn'
							onClick={() =>
								void navigate({ to: '/', search: withPersistentSearch(), hash: currentHash })
							}
							data-testid='admin-debug-back'
						>
							<ArrowLeft size={14} weight='bold' aria-hidden />
							Back
						</button>
						<div className='admin-debug-heading'>
							<p className='admin-debug-kicker'>Debug</p>
							<h1 className='admin-debug-title'>Admin</h1>
						</div>
						<div className='admin-debug-header-actions'>
							<button
								type='button'
								className='admin-debug-icon-button'
								onClick={() => void reload()}
								disabled={isLoading || busyAction !== null}
								title='Refresh'
								aria-label='Refresh admin data'
								data-testid='admin-debug-refresh'
							>
								<ArrowClockwise size={16} weight='bold' aria-hidden />
							</button>
						</div>
					</header>

					{error && (
						<p className='admin-debug-error' data-testid='admin-debug-error'>
							{error}
						</p>
					)}

					{isLoading && !summary ? (
						<p className='admin-debug-empty' data-testid='admin-debug-loading'>
							Loading admin data...
						</p>
					) : (
						<div className='admin-debug-content'>
							<AdminSection
								icon={<DoorOpen size={15} weight='bold' aria-hidden />}
								title='Open Rooms'
								count={summary?.rooms.length ?? 0}
							>
								{summary?.rooms.length ? (
									<div className='admin-debug-list'>
										{summary.rooms.map(room => {
											const key = `room:${room.code}`;
											return (
												<article className='admin-debug-row' key={room.code}>
													<div className='admin-debug-row-main'>
														<div className='admin-debug-row-title'>{room.code}</div>
														<div className='admin-debug-row-meta'>
															<span>{room.phase}</span>
															<span>{room.players.length ? room.players.join(', ') : 'Empty'}</span>
														</div>
													</div>
													<DeleteButton
														label={`Delete room ${room.code}`}
														disabled={busyAction !== null}
														busy={busyAction === key}
														testId={`admin-debug-delete-room-${room.code}`}
														onClick={() => deleteRoom(room.code)}
													/>
												</article>
											);
										})}
									</div>
								) : (
									<p className='admin-debug-empty'>No open rooms.</p>
								)}
							</AdminSection>

							<AdminSection
								icon={<Users size={15} weight='bold' aria-hidden />}
								title='History Users'
								count={summary?.users.length ?? 0}
							>
								{summary?.users.length ? (
									<div className='admin-debug-list'>
										{summary.users.map(user => {
											const key = `user:${user.id}`;
											return (
												<article className='admin-debug-row' key={user.id}>
													<div className='admin-debug-row-main'>
														<div className='admin-debug-row-title'>{user.name}</div>
														<div className='admin-debug-row-meta'>
															<span>{plural(user.gamesPlayed, 'game')}</span>
															{user.userId && <span>user {user.userId}</span>}
														</div>
													</div>
													<DeleteButton
														label={`Delete user ${user.name}`}
														disabled={busyAction !== null}
														busy={busyAction === key}
														testId={`admin-debug-delete-user-${user.id}`}
														onClick={() => deleteUser(user)}
													/>
												</article>
											);
										})}
									</div>
								) : (
									<p className='admin-debug-empty'>No history users.</p>
								)}
							</AdminSection>

							<AdminSection
								icon={<ClockCounterClockwise size={15} weight='bold' aria-hidden />}
								title='Games'
								count={summary?.games.length ?? 0}
							>
								{gameGroups.length ? (
									<div className='admin-debug-game-days'>
										{gameGroups.map(group => (
											<section className='admin-debug-game-day' key={group.key}>
												<h2 className='admin-debug-day-title'>{group.label}</h2>
												<div className='admin-debug-list'>
													{group.games.map(game => {
														const key = `game:${game.id}`;
														return (
															<article className='admin-debug-row' key={game.id}>
																<div className='admin-debug-row-main'>
																	<div className='admin-debug-row-title'>
																		{game.roomCode} · {game.score} pts
																	</div>
																	<div className='admin-debug-row-meta'>
																		<span>{formatTime(game.endedAt)}</span>
																		<span>{game.status}</span>
																		<span>{game.players.join(', ')}</span>
																	</div>
																</div>
																<DeleteButton
																	label={`Delete game ${game.roomCode} ${formatTime(game.endedAt)}`}
																	disabled={busyAction !== null}
																	busy={busyAction === key}
																	testId={`admin-debug-delete-game-${game.id}`}
																	onClick={() => deleteGame(game)}
																/>
															</article>
														);
													})}
												</div>
											</section>
										))}
									</div>
								) : (
									<p className='admin-debug-empty'>No finished games.</p>
								)}
							</AdminSection>
						</div>
					)}
				</section>
			</section>
		</main>
	);
}

function AdminSection({
	children,
	count,
	icon,
	title,
}: {
	children: ReactNode;
	count: number;
	icon: ReactNode;
	title: string;
}) {
	return (
		<section className='admin-debug-section'>
			<header className='admin-debug-section-header'>
				<div className='admin-debug-section-title'>
					{icon}
					<h2>{title}</h2>
				</div>
				<span className='admin-debug-count'>{count}</span>
			</header>
			{children}
		</section>
	);
}

function DeleteButton({
	busy,
	disabled,
	label,
	onClick,
	testId,
}: {
	busy: boolean;
	disabled: boolean;
	label: string;
	onClick: () => void;
	testId: string;
}) {
	return (
		<button
			type='button'
			className='admin-debug-icon-button danger'
			onClick={onClick}
			disabled={disabled}
			title={label}
			aria-label={label}
			data-testid={testId}
		>
			{busy ? (
				<ArrowClockwise size={15} weight='bold' aria-hidden />
			) : (
				<Trash size={15} weight='bold' aria-hidden />
			)}
		</button>
	);
}
