import { ArrowLeft } from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { useGameHistory } from '../hooks/useGameServer';
import { withPersistentSearch } from '../navigation';
import { getScoreFlavor, getScoreMaxFromSettings } from './scoreFlavor';
import type { GameHistoryEntry, LobbySettings } from '../utils/types';

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

function groupByDay(history: GameHistoryEntry[]) {
	const groups: Array<{ key: string; label: string; games: GameHistoryEntry[] }> = [];

	for (const game of history) {
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

function formatSettings(settings: LobbySettings) {
	const parts = [];
	if (settings.includeMulticolor) parts.push('Multicolor');
	if (settings.includeBlack) parts.push('Black Powder');
	if (settings.includeFlamboyants) parts.push('5 Flamboyants');
	if (settings.endlessMode) parts.push('Sudden Death');
	return parts.length ? parts.join(', ') : 'Standard';
}

export function HistoryScreen() {
	const navigate = useNavigate();
	const { history } = useGameHistory();
	const historyGroups = groupByDay(history);
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	return (
		<main className='app lobby-app history-app' data-testid='history-root'>
			<section className='lobby-shell-body lobby-shell-body-full'>
				<section className='lobby-card history-card'>
					<div className='history-topbar'>
						<button
							type='button'
							className='lobby-leave-btn'
							onClick={() =>
								void navigate({ to: '/', search: withPersistentSearch(), hash: currentHash })
							}
							data-testid='history-back'
						>
							<ArrowLeft size={14} weight='bold' aria-hidden />
							Back
						</button>
						<h1 className='history-title'>History</h1>
					</div>

					{history.length === 0 ? (
						<p className='history-empty' data-testid='history-empty'>
							No finished games yet.
						</p>
					) : (
						<div className='history-list' data-testid='history-list'>
							{historyGroups.map(group => (
								<section className='history-day' key={group.key} data-testid='history-day'>
									<h2 className='history-day-title'>{group.label}</h2>
									<div className='history-day-list'>
										{group.games.map(game => {
											const flavor = getScoreFlavor(
												game.score,
												getScoreMaxFromSettings(game.settings),
											);
											const rowStyle = { '--history-accent': flavor.accent } as CSSProperties;

											return (
												<article
													key={`${game.roomCode}-${game.endedAt}`}
													className='history-row'
													style={rowStyle}
													data-testid='history-row'
												>
													<div className='history-score'>
														<span className='history-score-value'>{game.score}</span>
														<span className='history-score-label'>pts</span>
													</div>
													<div className='history-main'>
														<div className='history-players'>{game.players.join(', ')}</div>
														<div className='history-meta'>
															<span>{formatTime(game.endedAt)}</span>
															<span>{formatSettings(game.settings)}</span>
														</div>
													</div>
													<div className='history-result' data-testid='history-result'>
														<span className='history-turns'>{game.turns} turns</span>
														<span className='history-badge' title={flavor.label}>
															<img
																className='history-badge-image'
																src={flavor.image}
																alt={flavor.label}
																data-testid='history-badge-image'
															/>
														</span>
													</div>
												</article>
											);
										})}
									</div>
								</section>
							))}
						</div>
					)}
				</section>
			</section>
		</main>
	);
}
