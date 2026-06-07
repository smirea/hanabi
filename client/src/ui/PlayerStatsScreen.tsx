import { ArrowLeft, ChartBar, Fire, LightbulbFilament, Medal, Trophy } from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useGameHistory } from '../hooks/useGameServer';
import { withPersistentSearch } from '../navigation';
import { playerIdForUser } from '../onlineGame';
import { storageKeys } from '../utils/constants';
import { LS } from '../utils/utils';
import { getScoreFlavor } from './scoreFlavor';
import { aggregatePlayerStats, type PlayerStatsAggregate } from './playerStats';

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) return '0';
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(1);
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(date);
}

function getCurrentPlayerId(): string | null {
	const userId = LS.get(storageKeys.serverUserId);
	return typeof userId === 'number' ? playerIdForUser(userId) : null;
}

function outcomeLabel(status: PlayerStatsAggregate['games'][number]['status']): string {
	if (status === 'won') return 'Win';
	if (status === 'lost') return 'Loss';
	return 'Done';
}

export function PlayerStatsScreen({ playerId }: { playerId?: string }) {
	const navigate = useNavigate();
	const { history } = useGameHistory();
	const currentPlayerId = getCurrentPlayerId();
	const players = useMemo(
		() => aggregatePlayerStats(history, currentPlayerId),
		[history, currentPlayerId],
	);
	const selectedPlayer = playerId ? players.find(player => player.id === playerId) : null;
	const bestAverageScore = Math.max(0, ...players.map(player => player.averageScore));
	const currentHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');

	function goHome(): void {
		void navigate({ to: '/', search: withPersistentSearch(), hash: currentHash });
	}

	function goStats(): void {
		void navigate({ to: '/stats', search: withPersistentSearch(), hash: currentHash });
	}

	function goPlayer(nextPlayerId: string): void {
		void navigate({
			to: '/stats/$playerId',
			params: { playerId: nextPlayerId },
			search: withPersistentSearch(),
			hash: currentHash,
		});
	}

	if (playerId) {
		return (
			<main className='app lobby-app player-stats-app' data-testid='player-stats-detail-root'>
				<section className='lobby-shell-body lobby-shell-body-full'>
					<section className='lobby-card player-stats-card detail'>
						<div className='history-topbar'>
							<button
								type='button'
								className='lobby-leave-btn'
								onClick={goStats}
								data-testid='player-stats-back'
							>
								<ArrowLeft size={14} weight='bold' aria-hidden />
								Stats
							</button>
							<h1 className='history-title'>Player Stats</h1>
						</div>

						{selectedPlayer ? (
							<PlayerStatsDetail player={selectedPlayer} />
						) : (
							<section className='history-empty' data-testid='player-stats-missing'>
								Player stats not found.
							</section>
						)}
					</section>
				</section>
			</main>
		);
	}

	return (
		<main className='app lobby-app player-stats-app' data-testid='player-stats-root'>
			<section className='lobby-shell-body lobby-shell-body-full'>
				<section className='lobby-card player-stats-card'>
					<div className='history-topbar'>
						<button
							type='button'
							className='lobby-leave-btn'
							onClick={goHome}
							data-testid='player-stats-home'
						>
							<ArrowLeft size={14} weight='bold' aria-hidden />
							Back
						</button>
						<h1 className='history-title'>Player Stats</h1>
					</div>

					{players.length === 0 ? (
						<section className='history-empty' data-testid='player-stats-empty'>
							No finished games yet.
						</section>
					) : (
						<section className='player-stats-summary' data-testid='player-stats-summary'>
							<div className='player-stats-totals'>
								<StatTile
									icon={<ChartBar size={15} weight='bold' />}
									label='games'
									value={history.length}
								/>
								<StatTile
									icon={<Medal size={15} weight='bold' />}
									label='players'
									value={players.length}
								/>
								<StatTile
									icon={<Trophy size={15} weight='bold' />}
									label='best avg'
									value={formatNumber(bestAverageScore)}
								/>
							</div>

							<div className='player-stats-table' data-testid='player-stats-table'>
								<div className='player-stats-row header'>
									<span>player</span>
									<span>games</span>
									<span>avg</span>
									<span>median</span>
								</div>
								{players.map(player => (
									<button
										key={player.id}
										type='button'
										className={`player-stats-row ${player.isCurrentUser ? 'you' : ''}`}
										onClick={() => goPlayer(player.id)}
										data-testid={`player-stats-row-${player.id}`}
									>
										<span className='player-stats-name'>
											{player.name}
											{player.isCurrentUser ? <span className='you-tag'>you</span> : null}
										</span>
										<span>{player.gamesPlayed}</span>
										<span>{formatNumber(player.averageScore)}</span>
										<span>{formatNumber(player.medianScore)}</span>
									</button>
								))}
							</div>
						</section>
					)}
				</section>
			</section>
		</main>
	);
}

function PlayerStatsDetail({ player }: { player: PlayerStatsAggregate }) {
	const maxScore = player.averageScore > 25 ? 30 : 25;
	const flavor = getScoreFlavor(Math.round(player.averageScore), maxScore);
	const scoreStyle = { '--history-accent': flavor.accent } as CSSProperties;
	const metricRows = [
		['score', player.totalScore, player.averageScore, player.medianScore],
		['turns', player.totalTurns, player.averageTurns, player.medianTurns],
		['rounds', player.totalRounds, player.averageRounds, player.medianRounds],
		['given', player.totalHintsGiven, player.averageHintsGiven, player.medianHintsGiven],
		[
			'received',
			player.totalHintsReceived,
			player.averageHintsReceived,
			player.medianHintsReceived,
		],
		['played', player.totalPlays, player.averagePlays, player.medianPlays],
		['discard', player.totalDiscards, player.averageDiscards, player.medianDiscards],
	] as const;

	return (
		<section className='player-stats-detail' data-testid='player-stats-detail'>
			<header className='player-stats-hero' style={scoreStyle}>
				<div>
					<p className='player-stats-kicker'>aggregate</p>
					<h2 className='player-stats-player-name'>
						{player.name}
						{player.isCurrentUser ? <span className='you-tag'>you</span> : null}
					</h2>
				</div>
				<div className='player-stats-hero-score'>
					<span>{formatNumber(player.averageScore)}</span>
					<span>avg</span>
				</div>
			</header>

			<div className='player-stats-totals'>
				<StatTile
					icon={<ChartBar size={15} weight='bold' />}
					label='games'
					value={player.gamesPlayed}
				/>
				<StatTile icon={<Trophy size={15} weight='bold' />} label='wins' value={player.wins} />
				<StatTile icon={<Fire size={15} weight='fill' />} label='losses' value={player.losses} />
				<StatTile
					icon={<LightbulbFilament size={15} weight='fill' />}
					label='hints/g'
					value={formatNumber(player.averageHintsGiven)}
				/>
			</div>

			<section className='player-stats-metric-table' data-testid='player-stats-metric-table'>
				<div className='player-stats-metric-row header'>
					<span>stat</span>
					<span>total</span>
					<span>avg/game</span>
					<span>median</span>
				</div>
				{metricRows.map(([label, total, avg, med]) => (
					<div key={label} className='player-stats-metric-row'>
						<span>{label}</span>
						<span>{formatNumber(total)}</span>
						<span>{formatNumber(avg)}</span>
						<span>{formatNumber(med)}</span>
					</div>
				))}
			</section>

			<section className='player-stats-recent' data-testid='player-stats-recent'>
				<h3 className='history-day-title'>recent games</h3>
				{player.games.slice(0, 8).map(game => (
					<article key={`${game.roomCode}-${game.endedAt}`} className='player-stats-game-row'>
						<div className='history-score'>
							<span className='history-score-value'>{game.score}</span>
							<span className='history-score-label'>pts</span>
						</div>
						<div className='history-main'>
							<div className='history-players'>{outcomeLabel(game.status)}</div>
							<div className='history-meta'>
								<span>{formatDate(game.endedAt)}</span>
								<span>{game.turns} turns</span>
								<span>{game.hintsGiven} given</span>
							</div>
						</div>
						<div className='player-stats-game-resources'>
							<span>
								{game.livesRemaining}/{game.maxLives}
							</span>
							<span>
								{game.hintsRemaining}/{game.maxHints}
							</span>
						</div>
					</article>
				))}
			</section>
		</section>
	);
}

function StatTile({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: string | number;
}) {
	return (
		<div className='player-stats-tile'>
			<span className='player-stats-tile-icon'>{icon}</span>
			<span className='player-stats-tile-value'>{value}</span>
			<span className='player-stats-tile-label'>{label}</span>
		</div>
	);
}
