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

type MetricDirection = 'higher' | 'lower';
type ComparisonKind = 'best' | 'top' | 'up' | 'neutral' | 'down' | 'bottom' | 'worst';

interface MetricRow {
	key: string;
	label: string;
	total: number;
	average: number;
	median: number;
	values: number[];
	globalValues: number[];
	direction: MetricDirection;
}

interface MetricComparison {
	kind: ComparisonKind;
	label: string;
	note: string;
}

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

function medianNumber(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid];
	return (sorted[mid - 1] + sorted[mid]) / 2;
}

function bestMetricValue(values: number[], direction: MetricDirection): number {
	if (values.length === 0) return 0;
	return direction === 'higher' ? Math.max(...values) : Math.min(...values);
}

function worstMetricValue(values: number[], direction: MetricDirection): number {
	if (values.length === 0) return 0;
	return direction === 'higher' ? Math.min(...values) : Math.max(...values);
}

function isBetterThan(value: number, other: number, direction: MetricDirection): boolean {
	return direction === 'higher' ? value > other : value < other;
}

function comparisonLabel(kind: ComparisonKind): string {
	switch (kind) {
		case 'best':
			return '★';
		case 'top':
			return '⇈';
		case 'up':
			return '↑';
		case 'down':
			return '↓';
		case 'bottom':
			return '⇊';
		case 'worst':
			return '';
		default:
			return '•';
	}
}

function metricComparison(row: MetricRow): MetricComparison | null {
	const values = row.globalValues.filter(Number.isFinite);
	if (values.length < 2 || !Number.isFinite(row.average)) return null;

	const allEqual = values.every(value => value === values[0]);
	if (allEqual) {
		return {
			kind: 'neutral',
			label: comparisonLabel('neutral'),
			note: `${row.label} matches the global pack at ${formatNumber(row.average)} per game.`,
		};
	}

	const best = bestMetricValue(values, row.direction);
	const worst = worstMetricValue(values, row.direction);
	const comparableValues = values.filter(value => value !== row.average);
	const denominator = Math.max(1, comparableValues.length);
	const betterThan = comparableValues.filter(value =>
		isBetterThan(row.average, value, row.direction),
	).length;
	const worseThan = comparableValues.filter(value =>
		isBetterThan(value, row.average, row.direction),
	).length;
	const betterPercent = Math.round((betterThan / denominator) * 100);
	const worsePercent = Math.round((worseThan / denominator) * 100);
	const globalMedian = medianNumber(values);
	const baseNote = `${row.label} is ${formatNumber(row.average)} per game; global median is ${formatNumber(globalMedian)}.`;

	if (row.average === best) {
		return {
			kind: 'best',
			label: comparisonLabel('best'),
			note: `Best global ${row.label}. ${baseNote}`,
		};
	}

	if (row.average === worst) {
		return {
			kind: 'worst',
			label: 'Worst',
			note: `Worst global ${row.label}. ${baseNote}`,
		};
	}

	if (betterPercent >= 75) {
		return {
			kind: 'top',
			label: comparisonLabel('top'),
			note: `Better than ${betterPercent}% of players. ${baseNote}`,
		};
	}

	if (betterPercent >= 55) {
		return {
			kind: 'up',
			label: comparisonLabel('up'),
			note: `Better than ${betterPercent}% of players. ${baseNote}`,
		};
	}

	if (worsePercent >= 75) {
		return {
			kind: 'bottom',
			label: comparisonLabel('bottom'),
			note: `Worse than ${worsePercent}% of players. ${baseNote}`,
		};
	}

	if (worsePercent >= 45) {
		return {
			kind: 'down',
			label: comparisonLabel('down'),
			note: `Worse than ${worsePercent}% of players. ${baseNote}`,
		};
	}

	return {
		kind: 'neutral',
		label: comparisonLabel('neutral'),
		note: `Near the global middle. ${baseNote}`,
	};
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
							<PlayerStatsDetail player={selectedPlayer} players={players} />
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

function PlayerStatsDetail({
	player,
	players,
}: {
	player: PlayerStatsAggregate;
	players: PlayerStatsAggregate[];
}) {
	const maxScore = player.averageScore > 25 ? 30 : 25;
	const flavor = getScoreFlavor(Math.round(player.averageScore), maxScore);
	const scoreStyle = { '--history-accent': flavor.accent } as CSSProperties;
	const metricRows: MetricRow[] = [
		{
			key: 'score',
			label: 'score',
			total: player.totalScore,
			average: player.averageScore,
			median: player.medianScore,
			values: player.games.map(game => game.score),
			globalValues: players.map(row => row.averageScore),
			direction: 'higher',
		},
		{
			key: 'turns',
			label: 'turns',
			total: player.totalTurns,
			average: player.averageTurns,
			median: player.medianTurns,
			values: player.games.map(game => game.turns),
			globalValues: players.map(row => row.averageTurns),
			direction: 'lower',
		},
		{
			key: 'rounds',
			label: 'rounds',
			total: player.totalRounds,
			average: player.averageRounds,
			median: player.medianRounds,
			values: player.games.map(game => game.rounds),
			globalValues: players.map(row => row.averageRounds),
			direction: 'lower',
		},
		{
			key: 'given',
			label: 'given',
			total: player.totalHintsGiven,
			average: player.averageHintsGiven,
			median: player.medianHintsGiven,
			values: player.games.map(game => game.hintsGiven),
			globalValues: players.map(row => row.averageHintsGiven),
			direction: 'higher',
		},
		{
			key: 'received',
			label: 'received',
			total: player.totalHintsReceived,
			average: player.averageHintsReceived,
			median: player.medianHintsReceived,
			values: player.games.map(game => game.hintsReceived),
			globalValues: players.map(row => row.averageHintsReceived),
			direction: 'lower',
		},
		{
			key: 'played',
			label: 'played',
			total: player.totalPlays,
			average: player.averagePlays,
			median: player.medianPlays,
			values: player.games.map(game => game.plays),
			globalValues: players.map(row => row.averagePlays),
			direction: 'higher',
		},
		{
			key: 'discard',
			label: 'discard',
			total: player.totalDiscards,
			average: player.averageDiscards,
			median: player.medianDiscards,
			values: player.games.map(game => game.discards),
			globalValues: players.map(row => row.averageDiscards),
			direction: 'lower',
		},
	];

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
					<span>best</span>
					<span>worst</span>
					<span>global</span>
				</div>
				{metricRows.map(row => {
					const comparison = metricComparison(row);
					return (
						<div key={row.key} className='player-stats-metric-row'>
							<span>{row.label}</span>
							<span>{formatNumber(row.total)}</span>
							<span>{formatNumber(row.average)}</span>
							<span>{formatNumber(row.median)}</span>
							<span>{formatNumber(bestMetricValue(row.values, row.direction))}</span>
							<span>{formatNumber(worstMetricValue(row.values, row.direction))}</span>
							<span>
								<ComparisonIndicator
									comparison={comparison}
									testId={`player-stats-comparison-${row.key}`}
								/>
							</span>
						</div>
					);
				})}
			</section>

			<section className='player-stats-recent' data-testid='player-stats-recent'>
				<h3 className='history-day-title'>recent games</h3>
				{player.games.slice(0, 8).map(game => {
					const gameFlavor = getScoreFlavor(game.score, game.score > 25 ? 30 : 25);
					const gameStyle = { '--history-accent': gameFlavor.accent } as CSSProperties;

					return (
						<article
							key={`${game.roomCode}-${game.endedAt}`}
							className='player-stats-game-row'
							style={gameStyle}
						>
							<div className='player-stats-game-score'>
								<div className='history-score'>
									<span className='history-score-value'>{game.score}</span>
									<span className='history-score-label'>pts</span>
								</div>
								<span className='history-badge player-stats-game-badge' title={gameFlavor.label}>
									<img
										className='history-badge-image'
										src={gameFlavor.image}
										alt={gameFlavor.label}
									/>
								</span>
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
					);
				})}
			</section>
		</section>
	);
}

function ComparisonIndicator({
	comparison,
	testId,
}: {
	comparison: MetricComparison | null;
	testId: string;
}) {
	if (!comparison) {
		return (
			<span
				className='player-stats-comparison neutral'
				aria-label='No global comparison'
				data-testid={testId}
			>
				•
			</span>
		);
	}

	return (
		<span
			className={`player-stats-comparison ${comparison.kind}`}
			data-tooltip={comparison.note}
			tabIndex={0}
			aria-label={comparison.note}
			data-testid={testId}
		>
			{comparison.kind === 'worst' ? (
				<img src='/score-badges/poo.png' alt='' className='player-stats-comparison-poo' />
			) : (
				comparison.label
			)}
		</span>
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
